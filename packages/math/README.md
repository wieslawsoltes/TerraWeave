# @terraweave/math

Deterministic math and scalar-field primitives. Original ES module package, version 0.1.0, MIT.

## Public API

`clamp`, `lerp`, `smoothstep`, `hash2`, `noise2`, `fbm`, `cellular`, `sample`, `statistics`, and matrix/camera helpers. Pure functions and typed arrays; no DOM, worker or GPU dependencies.

## Use

Install this archive and its sibling TerraWeave dependency archives together, or use the statically rewritten module under `dist/packages/math/src/index.js`. The package is included locally; npm publication is not assumed.

Runtime package dependencies: None.

```js
import * as TerraWeave from '@terraweave/math';
console.log(Object.keys(TerraWeave));
```

The workspace README and `docs/ARCHITECTURE.md` document field ownership, typed-array layout, coordinates, cancellation, backend requirements and complete integration examples. The application is a real consumer of this package, not an independent duplicate implementation.
