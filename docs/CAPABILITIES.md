# Capability matrix and deliberate boundaries

## Node catalog

| Category | Implemented nodes |
|---|---|
| Terrain — 11 | Mountain, Fractal noise, Island, Volcano, Dunes, Canyon, Crater, Cellular, Ridge range, Gradient, Constant |
| Simulate — 3 | Hydraulic erosion, Thermal erosion, Snow accumulation |
| Modify — 12 | Combine, Warp, Terrace, Levels, Clamp, Invert, Blur, Sharpen, Transform, Power, Absolute, Auto levels |
| Derive — 6 | Slope, Height range, Curvature, Aspect, Edge falloff, Flow accumulation |
| Colorize — 2 | Biome, Gradient color |
| Utility — 3 | Sculpt, Heightfield import, Output |

All 37 CPU node implementations were exercised for finite, correctly sized outputs. Native WGSL exists for the first 34 native-capable operations, while Flow accumulation, Sculpt and Heightfield import are explicit CPU bridges. Output is a retained pass-through, not a compute dispatch. “34 native-capable operations” therefore does not mean 34 separate shaders or 34 independent dispatches.

Combine supports blend, add, multiply, maximum, minimum, subtraction, screen and difference. Fractal noise supports standard, ridged and billow modes. Cellular supplies F1 or F2−F1. Biome/color gradients provide original alpine, desert, volcanic, coastal and arctic palettes.

## Implemented editor workflow

Graph creation/editing, named ports, transactional cycle checking, node dragging, pan/zoom/fit, minimap navigation, multi-selection, duplication, node copy/paste, input/wire disconnection, node deletion, property editing, bypass, explicit output choice, node/map preview, history, favorites, library search, preset loading, command palette, keyboard shortcuts, scene controls, resizable graph split, panel visibility, viewport capture, portable project import/export, embedded source data, indexed local autosave, build cancellation and memory-cache reuse.

Sculpt supports raise, lower, smooth and flatten strokes replayed in normalized coordinates. Terrain projects have one square field extent. There is no assumption that a displayed thumbnail is the terrain engine: thumbnails, histograms, derived maps and meshes all come from computed arrays.

## Not implemented / not claimed

- Proprietary `.tor` project compatibility, Gaea node serialization, exact Gaea UI replication, complete Gaea node catalog or proprietary erosion algorithms.
- Tiled/out-of-core terrain, arbitrary rectangular fields, UDIM outputs, seamless cross-tile erosion, distributed builds, multiple resolutions resident as a virtual texture or world streaming.
- A complete region system, subgraphs/macros, reusable graph-component definitions, node grouping, arbitrary runtime plugins or expression/script nodes.
- Layered image/texture painting, material-node graphs, external PBR texture libraries, megascans, texture-atlas baking, path tracing, procedural vegetation, object scattering or arbitrary 3D mesh terrain.
- GIS georeferencing, projection/reprojection, geospatial raster metadata, physically calibrated hydrology, hydraulic flood-risk modeling, groundwater or weather simulation.
- Collaboration, user accounts, cloud storage, synchronization, server-side rendering, telemetry, commercial licensing or online marketplaces.
- Native Gaea/Unreal/Unity application bridges. Standards-based PNG/RAW/EXR/OBJ/GLB files are the integration surface.
- A performance claim for 2048² erosion on every browser, or identical results at different sample densities.
- Hardware-certified WebGPU shaders or a completed cross-vendor/browser/mobile accessibility audit. The supplied browser environment exercised only CPU/software execution. Real worker, WebGL, IndexedDB and native GPU execution must be qualified on representative hardware using the supplied diagnostics.

## Precision and practical considerations

The viewport mesh is intentionally lower resolution than a high-resolution field. Exports can rebuild the graph at another resolution. Erosion iteration count is an artistic control; changing field resolution does not preserve an exact physical integration step. Float32 GPU intermediates may differ from CPU JavaScript double intermediates.

Image-derived source height is only as accurate as its input precision. Supported PNG16 uses the lossless parser. Browser-decoded image paths are 8-bit. RAW/EXR float output preserves negative and above-one values; integer PNG/RAW output uses its documented range mapping.

The software renderer is a functional fallback with reduced mesh/image limits, not evidence of GPU frame rates. The default 256² graph is the suggested starting point for interactive exploration. When memory becomes constrained, lower preview resolution and build larger fields for export only.
