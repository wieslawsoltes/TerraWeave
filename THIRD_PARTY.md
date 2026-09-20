# Provenance and third-party dependencies

TerraWeave's terrain algorithms, WGSL/GLSL sources, graph editor, controls, inline SVG icons, software renderer, binary codecs, build scripts and included example graphs are original code under the repository MIT license. Runtime and build have no third-party package dependencies. System fonts are referenced by CSS family names; no font files are shipped.

Workflow inspiration: QuadSpinner's public Gaea documentation, https://docs.gaea.app/using/index.html. TerraWeave is not affiliated with QuadSpinner. The shared ChatGPT reference supplied with the request did not expose readable conversation content during this build; no unseen specifications from that conversation were assumed.

Standards references:
- WebGPU: https://www.w3.org/TR/webgpu/
- WGSL: https://www.w3.org/TR/WGSL/
- PNG: https://www.w3.org/TR/png/
- OpenEXR file layout: https://openexr.com/en/latest/OpenEXRFileLayout.html
- glTF 2.0: https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html

Optional, unbundled test tools: Python Playwright, Chromium, Pillow, NumPy, OpenCV, trimesh. Their licenses are not replaced by this project's MIT license. A preinstalled TypeScript printer and PostCSS parser were used once to format the delivered source; neither is required by the build or included as a runtime dependency.
