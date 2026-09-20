# @terraweave/kernels

CPU reference kernels and worker execution. Original ES module package, version 0.1.0, MIT.

## Public API

`runCPU`, `thermalCPU`, `hydraulicCPU`, `CpuBackend`, `toPlain`, `fromPlain`. `new CpuBackend()` runs without the DOM in Node. Pass a served, correctly bundled `workerURL` to offload browser work. The worker entry point is exported as `@terraweave/kernels/worker.js`; the ready-to-host distribution rewrites all its dependency imports.

## Use

Install this archive and its sibling TerraWeave dependency archives together, or use the statically rewritten module under `dist/packages/kernels/src/index.js`. The package is included locally; npm publication is not assumed.

Runtime package dependencies: `@terraweave/core`, `@terraweave/math`, `@terraweave/nodes`.

```js
import * as TerraWeave from '@terraweave/kernels';
console.log(Object.keys(TerraWeave));
```

The workspace README and `docs/ARCHITECTURE.md` document field ownership, typed-array layout, coordinates, cancellation, backend requirements and complete integration examples. The application is a real consumer of this package, not an independent duplicate implementation.
