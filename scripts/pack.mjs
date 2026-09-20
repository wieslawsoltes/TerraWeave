/** Produce separately installable package archives without registry access. */
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const destination = resolve('artifacts');
await mkdir(destination, { recursive: true });
const packages = [];
for (const entry of await readdir('packages', { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const output = execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['pack', '--json', '--ignore-scripts', '--offline', '--pack-destination', destination],
    { cwd: resolve('packages', entry.name), encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  const [info] = JSON.parse(output);
  packages.push({ name: info.name, version: info.version, filename: info.filename, integrity: info.integrity, size: info.size });
  console.log(`${info.name} → ${info.filename}`);
}
await writeFile(resolve(destination, 'packages.json'), JSON.stringify(packages, null, 2));
