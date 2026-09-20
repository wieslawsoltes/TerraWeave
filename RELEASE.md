# TerraWeave 0.1.0 delivery

This archive contains complete editable source, ten standalone npm-package archives, the runnable application, prebuilt static distribution, one-file distribution, six portable starter projects, real example exports, documentation and validation evidence.

## Verified here

- 66 Node tests: graphs, scheduling, reference counting, CPU kernels and binary formats.
- 24 browser workflow checks: actual editor and software-rendered terrain with zero page errors.
- 5 independent file-format checks: Pillow, OpenCV OpenEXR, Python zipfile and trimesh.
- 12 package-integration checks: all ten archives install offline; headless terrain-to-EXR composition and public subpath resolution.

## Included but not native-execution verified here

WebGPU compute/render shaders, WebGL2 rendering, real module-worker transport, and IndexedDB persistence. The local browser was restricted; the tested app used its CPU main-thread/software fallback. Use `dist/diagnostics.html` on a normal localhost/HTTPS origin to obtain device-specific PASS/FAIL/SKIP evidence.

## Scope

37 terrain operations and six starter graphs, an operational node/sculpt editor, GPU-resident compute architecture with three documented CPU bridges, and standards-based image/mesh exports. This is not complete Gaea feature parity or proprietary project-format compatibility. See `docs/CAPABILITIES.md`.

## Entry points

- `npm start` serves the included `dist/` at http://localhost:4173.
- `npm run build` regenerates both distributions without installing packages.
- `dist/TerraWeave.html` is the self-contained app.
- `artifacts/*.tgz` are the ten reusable libraries; no npm publication is implied.
- `examples/exports/` contains actual interoperable terrain assets, not placeholder files.
