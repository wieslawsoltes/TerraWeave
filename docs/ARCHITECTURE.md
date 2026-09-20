# TerraWeave architecture and integration

## 1. Package boundaries

The application is composition code, not the engine. The same graph, kernels, scheduling and exporters can run without the editor or a canvas.

```text
HTML application
  ├─ graph-ui ── core + nodes + ui
  ├─ ui ── nodes
  ├─ renderer ── core + math
  ├─ io ── math
  └─ engine ── core + nodes
       └─ backend contract
            ├─ kernels ── core + nodes + math
            └─ webgpu ── core + nodes + kernels
                  ├─ native WGSL storage-buffer passes
                  └─ explicit CPU bridges: D8 flow / sculpt / import
```

All ten directories under `packages/` have their own package manifests and public ESM entry point. The build rewrites package specifiers into relative imports for static browser and worker consumption. The single-file linker turns the same modules into a static factory table, with neither `eval` nor `new Function`. It is intentionally a linker for this repository's controlled module syntax, not a general-purpose JavaScript bundler.

`ui/styles.css` supplies tokens and shared controls. `graph-ui/styles.css` supplies the graph surface and node/port styling. App-specific layout remains in `app/style.css`.

## 2. Project and DAG

A portable project stores `format: "terraweave"`, schema version, name, resolution, physical world extent, elevation scale, view settings, nodes, edges and final output identity. Import samples and normalized brush strokes are embedded, making projects portable without external asset URLs.

Each node has an immutable identity while present in the graph, type, display name, position, parameter dictionary and enabled state. Port semantics come from the node registry. Edges identify source node/output port and target node/input port, not geometric line endpoints. Moving a node does not modify computation.

Validation rejects unknown types, undeclared ports, duplicate IDs, multiple sources on one input, cycles, invalid values, non-finite import data and unsupported resolutions. Limits are 512 nodes, 2,048 edges and 10,000 stored brush dabs per sculpt node. Project parsing is bounded to 100 MiB; image/RAW file import is bounded to 64 MiB. These are safety limits, not a claim of interactive performance at their maxima.

Graph connection and clipboard paste validate their proposed change before committing. History records coherent project snapshots. Brush pointer-down to pointer-up is a single transaction. App history is bounded to 70 entries and approximately 64 MiB of serialized snapshots; one oversized most-recent entry may remain. Embedded assets therefore have an explicit memory cost.

Only ancestors of the requested output are evaluated. A diagnostic preview can target another node or one of its named output fields. Derivation branches not needed by the selected output are not built speculatively.

## 3. Fields, packets and ownership

A `Raster` owns either a CPU `Float32Array` or a GPU storage buffer. It records square resolution, channel count and reference count. Height and masks have one float per sample; color uses four float channels. A terrain packet groups height, named maps and optional RGBA color.

The initial owner receives one reference. `retainPacket` retains each owned field, and `releasePacket` releases it. GPU storage is destroyed only when the last owning reference is released. `selectPort` is a borrowed view; it is not an independently owned allocation.

The engine cache owns its packet references. Active graph evaluation retains inputs independently so an LRU eviction cannot free a field still needed downstream. The returned build result is retained for the caller. The renderer retains its current packet, and releases the previous one when it changes. Readback retains its source for the entire asynchronous copy/map lifetime.

```js
import { TerrainEngine } from '@terraweave/engine';
import { CpuBackend } from '@terraweave/kernels';
import { createPreset } from '@terraweave/nodes';
import { releasePacket } from '@terraweave/core';
import { encodePNG16 } from '@terraweave/io';

const backend = new CpuBackend(); // No DOM, worker, GPU or canvas required.
const engine = new TerrainEngine(backend, { cacheBytes: 128 * 1024 * 1024 });
let built;
try {
  built = await engine.build(createPreset('alpine'), {
    resolution: 256,
    onProgress: ({ name, fraction }) => console.log(name, fraction)
  });
  const snapshot = await backend.read(built.result);
  const png = await encodePNG16(snapshot.height, snapshot.size);
  // png is Uint8Array. Write it with node:fs or your application's transport.
  console.log(png.byteLength, built.metrics);
} finally {
  releasePacket(built?.result);
  await engine.dispose();
}
```

Outside an installed workspace, change imports to their matching `dist/packages/<name>/src/index.js` paths. `scripts/generate-examples.mjs` is a runnable headless integration example.

## 4. Backend contract and cancellation

A backend supplies `run(node, inputs, resolution, context)`, `read(packet)`, `readRaster(raster)` and `dispose()`. `run` returns a newly owned packet. Readback exposes a plain snapshot with `size`, `height`, `maps` and `color` typed arrays. Callers should treat returned CPU snapshots as read-only when they alias live CPU fields.

The context carries physical size/elevation, an abort signal and optional fractional simulation progress. The engine serializes build jobs and aborts the previous job when a new one starts. App build serials also guard against stale readback replacing a more recent viewport state.

CPU simulations yield every eight iterations when running directly. Module-worker execution copies inputs and transfers result buffers, protecting cached input ownership. Aborting worker work terminates that worker. A worker transport error falls back to direct kernels and updates the backend status rather than leaving the editor stuck.

GPU simulations batch up to 16 iterations, await submitted work at batch boundaries, then check cancellation. This bounds submission depth, but does not preempt an already submitted GPU dispatch. General compute operations check cancellation between nodes. The engine does not promise instantaneous cancellation of one expensive dispatch.

## 5. Native GPU implementation

The backend uses one-dimensional row-major storage buffers, with 8×8 workgroups for field operations. Runtime branch opcodes share a compiled general shader for generators, transforms, masks and color. Thermal and hydraulic simulation use dedicated multi-entry shaders. Normalization uses hierarchical 256-thread min/max reduction.

### Uniform ABI

The general `Params` block is 160 bytes:

| Offset | WGSL field | Meaning |
|---|---|---|
| 0 | `vec4u meta` | resolution, opcode, output channel, input-presence flags |
| 16 | `array<vec4f, 8> p` | 32 ordered scalar parameter slots |
| 144 | `vec4f world` | horizontal size and elevation scale; remaining slots reserved |

Parameter slot order is the declaration order of the node's schema. Changes must update both the schema and corresponding kernel interpretation. Booleans/enums are stored as numeric values. The reduction count block is 32 bytes to satisfy its declared aligned fields.

General compute binds uniform/A/B/mask/output/color/aux at bindings 0–6. Absent fields use valid zero/dummy buffers, not null resources. Readback uses separate `MAP_READ | COPY_DST` staging allocations. Temporary uniforms/state buffers are retired after their submitted work completes. Buffer sizes are checked against the adapter limit.

Shader compilation diagnostics are collected before pipeline creation. Backend operations balance validation and out-of-memory scopes, and reject errors before the result can enter the cache. Device loss is surfaced; the editor asks for recovery rather than silently treating a lost device as a successful build.

### Hydraulic erosion

Each cell carries `(height, water, sediment, accumulatedFlow)`. Each time step has an independent outgoing-flux pass and gather/erosion pass:

```text
provisional_outflow[d] = max(0, surfaceHeight - neighborSurfaceHeight) * flowRate
outflow *= min(1, availableWater / sum(provisional_outflow))
nextWater = max(0, water + rain + incoming - outgoing) * (1 - evaporation)
nextSediment = retainedSediment + incomingSediment
```

The gather pass derives a local transport capacity from slope and flux, exchanges material between soil and sediment with bounded erosion/deposition, and accumulates diagnostic wear/deposition/flow. Neighbor writes are never performed in-place. Domain boundaries are closed. Final suspended sediment is returned to height and counted as deposition, so exported terrain does not silently discard remaining sediment.

This is an original interactive finite-volume-inspired erosion model, not a calibrated fluid solver or an implementation of proprietary Gaea erosion. Rain, erodibility, capacity and iteration counts are artistic coefficients. Resolution changes can change results. It is not appropriate to claim engineering hydrology accuracy from the visual output.

### Thermal erosion

The transport pass computes four-neighbor excess height above a world-space talus threshold, caps outgoing mass, and apportions it across lower neighbors. A gather pass applies incoming/outgoing mass into a different height buffer. No atomics or cross-cell concurrent writes are required. Negative imported elevations do not create negative outgoing mass.

### Explicit CPU bridges

D8 flow accumulation sorts cells by height and accumulates along the steepest descending neighbor. Closed pits do not drain; this is not depression filling or a watershed GIS package. Sculpt replays normalized brush dabs. Imported arrays are bilinearly resampled. Those three operations read their needed inputs, execute the CPU implementation and upload results when the selected backend is GPU. Metrics label this bridge honestly.

## 6. Incremental cache and memory

Keys contain node type, enabled state, parameter values, embedded samples/strokes, resolution, world dimensions and ordered upstream signatures including selected output port. Graph positions, names, panel visibility and lighting are excluded. SHA-256 is used where available; a deterministic two-word fallback signature is used without secure crypto APIs.

Cache default budget is 256 MiB, with at most 128 entries and at least one result retained. Accounting deduplicates shared raster references. This is a **cache** budget, not a process peak-memory cap: active input packets, simulation scratch buffers, renderer retention, readbacks, embedded JSON and exports can exceed it. At 2048² a single scalar field is 16 MiB and a vec4 state field is 64 MiB; simulation plus five diagnostics can therefore consume hundreds of MiB.

Per-node times measure host-side backend orchestration, not hardware GPU timestamps. Viewport `cpuMs` is also not a GPU frame-time benchmark. The app's completed build wall time includes the snapshot work needed for display/export. Do not interpret low dispatch time as proof of GPU speed.

## 7. Rendering and interaction

WebGPU uses vertex pulling from a regular grid and storage-buffer height samples. Terrain walls and a water plane are separate draw paths. An explicit shared bind-group layout prevents render entry-point optimization from invalidating resource expectations. The renderer uses a depth attachment and 4× multisampling, with separate depth rules for background/flat/water.

Material lighting includes finite-difference normals, a directional sun, short terrain-shadow marches, local occlusion approximation, tone mapping and optional contour/wire overlays. These are not path-traced or PBR texture-layer authoring systems. A 3D display mesh is capped at 384 segments per side; field export still uses the requested full resolution.

The WebGL2 backend uses R32F/RGBA32F textures and manual interpolation. The fallback software renderer implements projected triangles, perspective-correct color interpolation and per-pixel depth testing. It caps its mesh at 128 segments and image width at 1,000 pixels. Software interaction is functional but is not a substitute for GPU frame-rate expectations.

The viewport only redraws when invalidated by camera, size, field or settings changes. Water phase is sampled when a frame is drawn rather than running a permanent animation loop. Orbit, pan, zoom and pinch update an isolated orbit camera. Sculpt editing uses normalized map coordinates in a 2D field view.

The graph is a semantic DAG with a DOM/SVG visual layer. It exposes callbacks so hosts can supply their own history and scheduling policies. It does not own the terrain backend.

## 8. Files and interoperability

Internal heights are float32 with a nominal 0–1 range. Values outside this range can exist. Mesh export multiplies height by the chosen elevation scale. The coordinate system is **+Y up**, image U → +X, image V → +Z, row-major top-left image origin.

| Format | Implementation |
|---|---|
| PNG16 | Grayscale, 16-bit, big-endian PNG sample encoding, CRC; unsigned output clips by selected range |
| RAW16 | Headerless little-endian unsigned16; clips to 0–1 |
| RAW32 | Headerless little-endian float32; preserves values outside 0–1 |
| OpenEXR | Uncompressed scanline FLOAT `Y` channel; preserves float32 values |
| Normal PNG | RGBA8; R tangent +X, G tangent +Z/image V down, B up; optional green flip in API |
| Splat PNG | RGBA8 sand/grass/rock/snow weights; quantized weights sum to 255 |
| OBJ | Meter-space vertices, UVs, normals and triangular faces; no companion MTL |
| GLB | glTF 2.0 binary, meter-space positions, normals, UVs, float vertex colors and uint32 indices |
| ZIP | ZIP32 STORE, UTF-8 names, CRC; project, heights, material maps, diagnostics and metadata |

GLB contains vertex color, not a baked texture-atlas material. PNG material conversion uses a simple gamma approximation. Exported diagnostic PNGs are normalized individually for inspection, while their `.r32` siblings preserve original values. The metadata states unclipped RAW behavior and coordinate conventions.

The import decoder losslessly handles supported non-interlaced 8/16-bit grayscale/RGB/alpha PNGs. Palette or interlaced files may fall back to browser image decoding at 8-bit precision; this is not advertised as lossless. JPEG/WebP imports use browser luminance decoding and square resampling, up to 1024 samples. RAW imports accept square fields up to 2048 samples with finite values.

Independent readers exercised in this delivery: Pillow PNG16, OpenCV EXR, Python `zipfile`, and trimesh OBJ/GLB. See `tests/external-results.json`.

## 9. Extending the library set

A new operation requires a schema in `nodes`, a reference kernel in `kernels`, and a GPU opcode/pass or explicit bridge in `webgpu`. Add tests for parameter effect, finite output, shape, mask semantics and any conservation/identity invariant. The inspector and node cards consume schema definitions automatically; a new algorithm should not require hand-written per-node UI panels.

The engine accepts any backend that implements its run/read/dispose contract. The current graph UI and kernels import the shared registry rather than supporting a runtime plugin marketplace. A custom node registry therefore requires coordinating the relevant packages; claiming arbitrary hot-loaded plugins would be inaccurate.

For production GPU qualification, run `diagnostics.html` on representative adapters and browsers and retain its JSON report. It never turns an unavailable capability into a passing result. Native execution remained unverified in the supplied test environment.
