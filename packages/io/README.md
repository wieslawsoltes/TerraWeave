# @terraweave/io

Heightfield, mesh and project interchange. Original ES module package, version 0.1.0, MIT.

## Public API

`encodePNG16`, `encodePNG8`, `decodePNGHeight`, `raw16`, `raw32`, `decodeRaw`, `encodeEXR`, `normalMap`, `colorMap`, `splatMap`, `meshData`, `encodeOBJ`, `encodeGLB`, `encodeZIP`, `exportBundle`, `importImage`, `download`, `ProjectStore`. Binary encoders run headlessly; image loading, download and IndexedDB helpers require browser APIs. RAW/EXR float formats preserve out-of-range height values.

## Use

Install this archive and its sibling TerraWeave dependency archives together, or use the statically rewritten module under `dist/packages/io/src/index.js`. The package is included locally; npm publication is not assumed.

Runtime package dependencies: `@terraweave/math`.

```js
import * as TerraWeave from '@terraweave/io';
console.log(Object.keys(TerraWeave));
```

The workspace README and `docs/ARCHITECTURE.md` document field ownership, typed-array layout, coordinates, cancellation, backend requirements and complete integration examples. The application is a real consumer of this package, not an independent duplicate implementation.
