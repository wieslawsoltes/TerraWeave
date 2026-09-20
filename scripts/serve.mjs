import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve(process.env.SERVE_DIR || 'dist'), port = Number(process.env.PORT || 4173);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm', '.map': 'application/json' };
http.createServer(async (req, res) => {
    try {
        let p = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
        if (p !== root && !p.startsWith(root + sep)) {
            res.writeHead(403).end();
            return;
        }
        if ((await stat(p)).isDirectory())
            p = resolve(p, 'index.html');
        const body = await readFile(p);
        res.writeHead(200, { 'Content-Type': mime[extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' }).end(body);
    }
    catch {
        res.writeHead(404).end('Not found');
    }
}).listen(port, '0.0.0.0', () => console.log(`TerraWeave: http://localhost:${port}`));
