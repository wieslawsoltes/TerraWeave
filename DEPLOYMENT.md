# TerraWeave on GitHub Pages

**Open the studio:** https://wieslawsoltes.github.io/TerraWeave/

**Native capability diagnostics:** https://wieslawsoltes.github.io/TerraWeave/diagnostics.html

**Single-file application:** https://wieslawsoltes.github.io/TerraWeave/TerraWeave.html

**Build and deployment history:** https://github.com/wieslawsoltes/TerraWeave/actions/workflows/pages.yml

## Automatic deployment

Every push to `main` starts `.github/workflows/pages.yml`. Manual workflow dispatch is also supported.

The build runs the core suite and isolated package-installation suite, regenerates sample exports and the static application, and checks the binary formats with independent readers. Only `dist/` is published; source, repository metadata and CI tools are not exposed as the website document root.

The deployment job uses GitHub Pages and short-lived OIDC credentials with only `pages: write` and `id-token: write`. No personal access token, npm token or third-party hosting account is needed. Runtime assets use relative URLs so project-subdirectory hosting works.

After publication, `scripts/verify-pages.py` checks the exact Git revision from `version.json`, HTTP status and MIME types of essential assets, and boots the actual public application in Chromium. It checks a finite, non-flat terrain, the starter graph, desktop and mobile layout, and uncaught page errors. The workflow retains screenshots and a report with the actual compute and rendering backends.

A successful fallback run does not certify physical GPU behavior. Use `diagnostics.html` on the target machine for native WebGPU, worker, and IndexedDB capability checks. A skipped capability is not a pass.

## Repository contents

- `app/`: terrain-authoring application.
- `packages/`: all ten standalone `@terraweave/*` libraries.
- `dist/`: prebuilt static application and `TerraWeave.html`.
- `artifacts/`: installable npm tarballs and manifest, not a claim of npm registry publication.
- `examples/`: six starter projects and generated PNG16, RAW, EXR, GLB, OBJ and ZIP assets.
- `tests/`, `docs/`: test sources, reports, architecture, capability boundaries and screenshots.

To reproduce locally with Node.js 20 or newer:

```sh
npm test
npm run test:packages
npm run examples
npm run build
npm start
```

Build and runtime have no external JavaScript dependencies. Playwright and independent image/mesh readers are optional test-only dependencies installed in CI.
