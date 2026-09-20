/** Reproducible portable examples and standards-validation fixtures. */
import { mkdir, writeFile } from 'node:fs/promises';
import { createPreset } from '../dist/packages/nodes/src/index.js';
import { TerrainEngine } from '../dist/packages/engine/src/index.js';
import { CpuBackend } from '../dist/packages/kernels/src/index.js';
import { releasePacket } from '../dist/packages/core/src/index.js';
import { encodePNG16, encodeEXR, encodeGLB, encodeOBJ, exportBundle, raw32 } from '../dist/packages/io/src/index.js';
await mkdir('examples/exports', { recursive: true });
for (const key of ['alpine', 'island', 'desert', 'canyon', 'volcano', 'arctic']) {
    await writeFile(`examples/${key}.terraweave.json`, JSON.stringify(createPreset(key), null, 2));
}
const project = createPreset('alpine');
project.resolution = 128;
const engine = new TerrainEngine(new CpuBackend());
let result;
try {
    ({ result } = await engine.build(project));
    const snapshot = await engine.backend.read(result);
    const files = {
        'alpine-height.png': await encodePNG16(snapshot.height, snapshot.size),
        'alpine-height.r32': raw32(snapshot.height),
        'alpine-height.exr': encodeEXR(snapshot.height, snapshot.size),
        'alpine-terrain.glb': encodeGLB(snapshot, { worldSize: project.worldSize, elevation: project.elevation, segments: 64 }),
        'alpine-terrain.obj': encodeOBJ(snapshot, { worldSize: project.worldSize, elevation: project.elevation, segments: 64 }),
        'alpine-assets.zip': await exportBundle(snapshot, project)
    };
    for (const [name, bytes] of Object.entries(files))
        await writeFile(`examples/exports/${name}`, bytes);
    console.log(`Created six portable projects and ${Object.keys(files).length} export fixtures.`);
}
finally {
    releasePacket(result);
    await engine.dispose();
}
