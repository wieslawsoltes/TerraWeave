# Validation evidence — TerraWeave 0.1.0

The delivered source includes tests, actual report files and screenshots. A path that was unavailable is listed separately rather than counted as passing.

## Completed checks

| Gate | Result | Evidence |
|---|---:|---|
| Node core, engine, kernels and binary formats | 66 passed / 0 failed | `tests/node-results.txt` |
| Browser integration | 24 passed / 0 page errors | `tests/browser-results.json` |
| Independent file readers | 5 passed | `tests/external-results.json` |
| Isolated offline package integration | 12 passed | `tests/package-results.json` |

The Node gate covers every registered CPU node, repeatable noise and seed effects, parameter influence, zero masks, thermal material conservation, hydraulic settled-material conservation, dry erosion identity, negative elevation handling, normalization, sculpt replay, project validation, cycle rollback, cache invalidation, cancellation, history and raster ownership. Binary tests validate 16-bit samples, CRC, RAW endianness, EXR headers/scanlines, mesh normals/winding/bounds, GLB structure, ZIP members and splat-weight sums.

The browser gate used the actual production single-file app with its CPU main-thread backend and original software rasterizer. It checked initial terrain, four independent hydraulic diagnostic maps, parameter editing, undo/redo, cached rebuild, Flow preview, actual pointer-driven sculpting, brush history, atomic bad paste, duplication with connections, pointer-driven node movement, command-palette execution, actual PNG16 export encoding at a requested build resolution, portable project saving, all six starter graphs and mobile layout/inspector behavior.

For export UI testing, the browser runner intercepts anchor download clicks and inspects the created Blob. It does not replace the exporter or terrain engine. That test proves correct file generation and export dispatch, not an OS download dialog or filesystem save interaction.

Independent interoperability validation uses implementations outside TerraWeave:

1. Pillow reads the generated grayscale PNG16 and agrees within one quantization level with the source floats.
2. OpenCV's OpenEXR reader recovers the exact original float32 height samples from the FLOAT `Y` scanline file.
3. Python `zipfile` verifies every ZIP member CRC and checks the unclipped RAW payload.
4. trimesh reads the GLB with 4,225 vertices, 8,192 triangles and correct meter-space bounds.
5. trimesh reads the OBJ with the same geometry counts and bounds.

The package gate installs all ten local npm archives into a temporary project without registry access, imports every public ESM entry point, runs a headless graph-to-EXR pipeline through the installed packages, and resolves public stylesheet/worker/shader/camera subpaths. Reproduce with `npm run test:packages`.

## Test-environment limitations

The available Chromium installation had managed navigation restrictions. The tests did not remove or override those policies. `page.set_content` loaded the self-contained application into an inline document. That document did not expose usable native WebGPU, WebGL or persistent IndexedDB, and its module-worker transport fell back to direct execution.

Therefore **no native GPU speed, shader execution, GPU/CPU numerical parity, WebGL pipeline execution, real module-worker transport or persistent IndexedDB round-trip is claimed as passed here**. Shader source, balanced error scopes, GPU lifetime handling and fallback code are included, but source review is not equivalent to device execution.

`tests/browser-console.json` contains expected capability warnings from this environment. `tests/browser-results.json` reports the observed backend explicitly as CPU / no worker / Software and zero page errors.

## Native validation supplied for the host machine

After `npm start`, open `http://localhost:4173/diagnostics.html`.

The runner tests database reopen/readback using its own temporary key, actual module-worker transport, all 37 operation paths, CPU/GPU per-field differences, native rendering of 3D/2D material/height/clay/normal/wire modes, canvas PNG readback and uncaptured device errors. It also exercises WebGL2 when available. JSON reports expose PASS, FAIL and SKIP counts independently. Missing WebGPU never passes the GPU gate.

Sample comparison allows 0.003 absolute + 0.003 times reference magnitude. This is a practical numerical regression threshold for independently evaluated float/double kernels, not a statement of mathematical equivalence. Both maximum absolute and RMS differences are recorded. Native renderer checks validate command encoding and errors, not a screenshot golden-image match.

## Reproduce

```sh
npm test
npm start
# In another terminal with Python Playwright and Chromium installed:
python tests/browser.py --url http://localhost:4173 --browser /path/to/chromium
# Restricted inline fallback gate:
python tests/browser.py --inline --browser /path/to/chromium
# Independent readers after installing optional test dependencies:
node scripts/generate-examples.mjs
python tests/external_readers.py
```

Screenshots in `docs/screenshots/` are captures of the actual running app, not generated concept art. Final desktop/mobile captures dismiss transient notifications before capturing so controls are visible. Performance timings in reports are local observations, not cross-device benchmarks.
