# @terraweave/engine

Incremental DAG scheduling and result caching. Original ES module package, version 0.1.0, MIT.

## Public API

`TerrainEngine(backend, { cacheBytes, maxNodes })`. `build(project, { target, resolution, onProgress })` returns an owned result and metrics. `cancel`, `clearCache`, `memoryUsage`, `getNodeResult`, and async `dispose` support host integration. `getNodeResult` returns a borrowed cache reference; retain it before keeping it beyond cache mutation.

## Use

Install this archive and its sibling TerraWeave dependency archives together, or use the statically rewritten module under `dist/packages/engine/src/index.js`. The package is included locally; npm publication is not assumed.

Runtime package dependencies: `@terraweave/core`, `@terraweave/nodes`.

```js
import * as TerraWeave from '@terraweave/engine';
console.log(Object.keys(TerraWeave));
```

The workspace README and `docs/ARCHITECTURE.md` document field ownership, typed-array layout, coordinates, cancellation, backend requirements and complete integration examples. The application is a real consumer of this package, not an independent duplicate implementation.
