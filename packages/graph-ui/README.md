# @terraweave/graph-ui

Reusable DOM/SVG terrain graph editor. Original ES module package, version 0.1.0, MIT.

## Public API

`GraphEditor(rootElement, graph, callbacks)`. Host callbacks include `onBeforeChange`, `onChange`, `onSelect`, preview and context-menu hooks. Navigation, semantic wiring, node identity, clipboard and thumbnail logic live here; terrain computation stays outside. Load both `@terraweave/ui/styles.css` and `@terraweave/graph-ui/styles.css`. The host element must have a nonzero size.

## Use

Install this archive and its sibling TerraWeave dependency archives together, or use the statically rewritten module under `dist/packages/graph-ui/src/index.js`. The package is included locally; npm publication is not assumed.

Runtime package dependencies: `@terraweave/core`, `@terraweave/nodes`, `@terraweave/ui`.

```js
import * as TerraWeave from '@terraweave/graph-ui';
console.log(Object.keys(TerraWeave));
```

The workspace README and `docs/ARCHITECTURE.md` document field ownership, typed-array layout, coordinates, cancellation, backend requirements and complete integration examples. The application is a real consumer of this package, not an independent duplicate implementation.
