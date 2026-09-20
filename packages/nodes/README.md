# @terraweave/nodes

Shared declarative terrain node registry. Original ES module package, version 0.1.0, MIT.

## Public API

`registry`, `categories`, `defaults`, `createPreset`, `presetDescriptions`, `inputLabels`, `portLabels`. Schemas are shared by the editor, CPU reference operations and GPU uniform packing. Parameter insertion order is part of the native uniform ABI.

## Use

Install this archive and its sibling TerraWeave dependency archives together, or use the statically rewritten module under `dist/packages/nodes/src/index.js`. The package is included locally; npm publication is not assumed.

Runtime package dependencies: None.

```js
import * as TerraWeave from '@terraweave/nodes';
console.log(Object.keys(TerraWeave));
```

The workspace README and `docs/ARCHITECTURE.md` document field ownership, typed-array layout, coordinates, cancellation, backend requirements and complete integration examples. The application is a real consumer of this package, not an independent duplicate implementation.
