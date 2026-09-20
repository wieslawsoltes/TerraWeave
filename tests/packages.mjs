/** Verify local archive installation and composition in an isolated npm project. */
import { mkdtemp, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
const root = process.cwd(), directory = await mkdtemp(join(tmpdir(), 'terraweave-packages-'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
try {
  execFileSync(npm, ['run', 'pack'], { cwd: root, stdio: 'inherit' });
  const archives = (await readdir('artifacts')).filter(p => p.endsWith('.tgz')).map(p => resolve('artifacts', p));
  await writeFile(join(directory, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  execFileSync(npm, ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', ...archives], { cwd: directory, stdio: 'inherit' });
  await writeFile(join(directory, 'check.mjs'), "import { writeFile } from 'node:fs/promises';\nimport { createPreset } from '@terraweave/nodes';\nimport { TerrainEngine } from '@terraweave/engine';\nimport { CpuBackend } from '@terraweave/kernels';\nimport { releasePacket } from '@terraweave/core';\nimport { encodeEXR } from '@terraweave/io';\nconst names = ['core','engine','graph-ui','io','kernels','math','nodes','renderer','ui','webgpu'];\nconst checks=[];\nfor (const name of names) {\n const exports=await import('@terraweave/'+name);\n if (!Object.keys(exports).length) throw new Error('Missing exports: '+name);\n checks.push(`${name}: local npm archive installs and ESM entry loads`);\n}\nconst project=createPreset('alpine');project.resolution=64;project.nodes.find(n=>n.type==='hydraulic').params.iterations=4;\nconst engine=new TerrainEngine(new CpuBackend());let result;\ntry {\n ({result}=await engine.build(project));\n const snapshot=await engine.backend.read(result);\n if (!snapshot.height.every(Number.isFinite) || snapshot.height.length!==4096) throw new Error('Headless package build failed');\n const exr=encodeEXR(snapshot.height,snapshot.size);\n if (new DataView(exr.buffer).getUint32(0,true)!==20000630)throw new Error('Invalid EXR');\n checks.push('Installed package integration: headless 64\u00b2 graph \u2192 exact FLOAT EXR encoder');\n for (const asset of ['@terraweave/ui/styles.css','@terraweave/graph-ui/styles.css','@terraweave/kernels/worker.js','@terraweave/webgpu/shaders','@terraweave/renderer/camera']) import.meta.resolve(asset);\n checks.push('CSS, worker, shader and camera public subpath exports resolve');\n} finally {releasePacket(result);await engine.dispose();}\nconst report={passed:checks.length,checks};\nawait writeFile(process.env.TERRAWEAVE_PACKAGE_REPORT,JSON.stringify(report,null,2));\nconsole.log(JSON.stringify(report,null,2));\n");

  execFileSync(process.execPath, ['check.mjs'], { cwd: directory, stdio: 'inherit', env: { ...process.env, TERRAWEAVE_PACKAGE_REPORT: resolve(root, 'tests/package-results.json') } });
} finally { await rm(directory, { recursive: true, force: true }); }
