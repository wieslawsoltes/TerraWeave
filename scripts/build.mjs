import { mkdir, readdir, readFile, writeFile, cp, rm } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
const out = resolve('dist');
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
async function copy(dir) {
    for (const ent of await readdir(dir, { withFileTypes: true })) {
        const path = `${dir}/${ent.name}`;
        if (ent.isDirectory()) {
            await copy(path);
            continue;
        }
        const dst = resolve(out, path);
        await mkdir(dirname(dst), { recursive: true });
        if (path.endsWith('.js')) {
            let s = await readFile(path, 'utf8');
            s = s.replace(/(['"])@terraweave\/([\w-]+)\1/g, (_, q, p) => { let r = relative(dirname(dst), resolve(out, `packages/${p}/src/index.js`)).replaceAll('\\', '/'); if (!r.startsWith('.'))
                r = './' + r; return q + r + q; });
            await writeFile(dst, s);
        }
        else
            await cp(path, dst);
    }
}
await copy('packages');
await copy('app');
await cp('examples', `${out}/examples`, { recursive: true });
let html = await readFile('app/index.html', 'utf8');
html = html.replaceAll('href="../packages/', 'href="./packages/').replace('href="./style.css"', 'href="./app/style.css"').replace('src="./main.js"', 'src="./app/main.js"');
await writeFile(`${out}/index.html`, html);
await writeFile(`${out}/.nojekyll`, '');
console.log('Built standalone, dependency-free static distribution in dist/');
let diagnostics = await readFile('app/diagnostics.html', 'utf8');
diagnostics = diagnostics.replace('src="./diagnostics.js"', 'src="./app/diagnostics.js"');
await writeFile(`${out}/diagnostics.html`, diagnostics);

await cp('LICENSE', `${out}/LICENSE`);
await cp('THIRD_PARTY.md', `${out}/THIRD_PARTY.md`);
