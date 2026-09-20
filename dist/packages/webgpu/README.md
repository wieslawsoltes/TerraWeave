# @terraweave/webgpu

Native WebGPU terrain kernels and buffer management. Original ES module package, version 0.1.0, MIT.

## Public API

`createGPUDevice`, `GpuBackend`. Native shader strings are exposed through `@terraweave/webgpu/shaders`. Supports resident scalar/color fields, two-pass thermal transport, multi-pass hydraulic simulation, hierarchical normalization, asynchronous readback and explicit CPU bridges. Requires a caller-owned WebGPU device; `dispose()` releases backend resources but does not destroy a shared device. Native execution was not available in the supplied test environment.

## Use

Install this archive and its sibling TerraWeave dependency archives together, or use the statically rewritten module under `dist/packages/webgpu/src/index.js`. The package is included locally; npm publication is not assumed.

Runtime package dependencies: `@terraweave/core`, `@terraweave/kernels`, `@terraweave/nodes`.

```js
import * as TerraWeave from '@terraweave/webgpu';
console.log(Object.keys(TerraWeave));
```

The workspace README and `docs/ARCHITECTURE.md` document field ownership, typed-array layout, coordinates, cancellation, backend requirements and complete integration examples. The application is a real consumer of this package, not an independent duplicate implementation.
