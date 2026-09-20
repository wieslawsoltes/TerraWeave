# @terraweave/core

Graph model, project validation and raster ownership. Original ES module package, version 0.1.0, MIT.

## Public API

`Graph`, `Raster`, `field`, `packet`, `retainPacket`, `releasePacket`, `selectPort`, `History`, `Signal`, `BuildCancelled`, `throwIfAborted`. Every newly owned result must be released. A borrowed port view is not an independently retained packet.

## Use

Install this archive and its sibling TerraWeave dependency archives together, or use the statically rewritten module under `dist/packages/core/src/index.js`. The package is included locally; npm publication is not assumed.

Runtime package dependencies: None.

```js
import * as TerraWeave from '@terraweave/core';
console.log(Object.keys(TerraWeave));
```

The workspace README and `docs/ARCHITECTURE.md` document field ownership, typed-array layout, coordinates, cancellation, backend requirements and complete integration examples. The application is a real consumer of this package, not an independent duplicate implementation.
