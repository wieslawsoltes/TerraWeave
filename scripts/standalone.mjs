/** Small static linker for this workspace's deliberately restricted ES-module syntax.
 * No eval, runtime loader requests, or third-party bundler. The source packages remain ESM.
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
const files = new Map(), root = process.cwd();
async function collect(dir) { for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = dir + '/' + e.name;
    if (e.isDirectory())
        await collect(p);
    else if (p.endsWith('.js'))
        files.set(p, await readFile(p, 'utf8'));
} }
await collect('packages');
files.set('app/main.js', await readFile('app/main.js', 'utf8'));
function target(from, spec) { return spec.startsWith('@terraweave/') ? `packages/${spec.split('/')[1]}/src/index.js` : relative(root, resolve(dirname(from), spec)).replaceAll('\\', '/'); }
function link(id, source) {
    const names = new Set();
    source = source.replace(/import\s+([\s\S]*?)\s+from\s+(['"])([^'"]+)\2\s*;/g, (_, clause, q, spec) => { const path = JSON.stringify(target(id, spec)); if (clause.startsWith('* as '))
        return `const ${clause.slice(5)}=__require(${path});`; return `const ${clause.replace(/\bas\b/g, ':')}=__require(${path});`; });
    source = source.replace(/export\s*\{([^}]+)\}\s*;/g, (_, symbols) => { symbols.split(',').forEach(s => names.add(s.trim())); return ''; });
    source = source.replace(/export\s+(async\s+)?(function|class|const|let)\s+(\w+)/g, (_, async = '', kind, name) => { names.add(name); return `${async}${kind} ${name}`; });
    if (id === 'app/main.js')
        source = source.replace(/new URL\(\s*['"]\.\.\/packages\/kernels\/src\/worker\.js['"]\s*,\s*import\.meta\.url\s*\)/, '__terraweaveWorker');
    if (/\bimport\s*\(/.test(source) || source.includes('import.meta'))
        throw new Error('Unsupported dynamic module syntax: ' + id);
    return `${JSON.stringify(id)}:(__require)=>{\n${source}\nreturn {${[...names].join(',')}};\n}`;
}
function runtime(entries, entry) { return `(()=>{'use strict';const __modules={${entries.map(([id, s]) => link(id, s)).join(',\n')}},__cache={};function __require(id){if(!__cache[id]){if(!__modules[id])throw new Error('Module not found: '+id);__cache[id]=__modules[id](__require);}return __cache[id];}__require(${JSON.stringify(entry)});})();`; }
const workerFiles = [...files].filter(([id]) => /^packages\/(math|core|nodes|kernels)\//.test(id));
const worker = runtime(workerFiles, 'packages/kernels/src/worker.js');
const appFiles = [...files].filter(([id]) => !id.endsWith('/worker.js'));
const script = `const __terraweaveWorker=URL.createObjectURL(new Blob([${JSON.stringify(worker)}],{type:'text/javascript'}));\n${runtime(appFiles, 'app/main.js')}`;
let html = await readFile('app/index.html', 'utf8');
const css = (await Promise.all(['packages/ui/src/styles.css', 'packages/graph-ui/src/styles.css', 'app/style.css'].map(p => readFile(p, 'utf8')))).join('\n');
html = html.replace(/<link rel="stylesheet" href="\.\.\/packages\/[^"]+">\s*/g, '');
html = html.replace('<link rel="stylesheet" href="./style.css">', `<style>${css}</style>`).replace('<script type="module" src="./main.js"></script>', `<script>${script.replaceAll('</script', '<\\/script')}</script>`);
await writeFile('dist/TerraWeave.html', html);
console.log(`Linked single-file app: ${(Buffer.byteLength(html) / 1024).toFixed(0)} KiB`);
