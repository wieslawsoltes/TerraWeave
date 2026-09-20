# @terraweave/renderer

Terrain rendering with WebGPU, WebGL2 and software fallback. Original ES module package, version 0.1.0, MIT.

## Public API

`createRenderer(canvas, { device })`, `WebGPURenderer`, `WebGLRenderer`, `SoftwareRenderer`, `OrbitCamera`. Call `setTerrain(packet, optionalCPUSnapshot)`, `setSettings`, `setRange`, `capture`, `clear`, and `dispose`. WebGL/software viewing needs CPU data; the native renderer accepts resident GPU buffers. Camera is available from `@terraweave/renderer/camera`, shaders from `/shaders`, and GLSL from `/glsl`.

## Use

Install this archive and its sibling TerraWeave dependency archives together, or use the statically rewritten module under `dist/packages/renderer/src/index.js`. The package is included locally; npm publication is not assumed.

Runtime package dependencies: `@terraweave/core`, `@terraweave/math`.

```js
import * as TerraWeave from '@terraweave/renderer';
console.log(Object.keys(TerraWeave));
```

The workspace README and `docs/ARCHITECTURE.md` document field ownership, typed-array layout, coordinates, cancellation, backend requirements and complete integration examples. The application is a real consumer of this package, not an independent duplicate implementation.
