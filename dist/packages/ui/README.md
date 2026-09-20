# @terraweave/ui

Original DOM controls, icons and theme styles. Original ES module package, version 0.1.0, MIT.

## Public API

`icon`, `el`, `escapeHTML`, `iconButton`, `parameterControl`, `parameterPanel`, `toast`, `modal`, `menu`, `histogram`, `terrainThumbnail`, `resizer`. Import `@terraweave/ui/styles.css` through your CSS pipeline. The stylesheet supplies root design tokens, a document reset, form controls and overlay primitives. No external font or icon files are needed.

## Use

Install this archive and its sibling TerraWeave dependency archives together, or use the statically rewritten module under `dist/packages/ui/src/index.js`. The package is included locally; npm publication is not assumed.

Runtime package dependencies: `@terraweave/nodes`.

```js
import * as TerraWeave from '@terraweave/ui';
console.log(Object.keys(TerraWeave));
```

The workspace README and `docs/ARCHITECTURE.md` document field ownership, typed-array layout, coordinates, cancellation, backend requirements and complete integration examples. The application is a real consumer of this package, not an independent duplicate implementation.
