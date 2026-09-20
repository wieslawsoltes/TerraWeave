"""Verify the exact Pages revision, public assets, and a running terrain studio.

Usage: python scripts/verify-pages.py <https-site-url> <expected-git-sha>
Requires Python Playwright and its Chromium installation (test-only dependencies).
"""
import argparse
import json
import time
import urllib.request
from pathlib import Path
from urllib.parse import urljoin
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('url')
parser.add_argument('revision')
args = parser.parse_args()
base = args.url.rstrip('/') + '/'
if not base.startswith('https://'):
    raise SystemExit('Deployment verification requires an HTTPS URL')

out = Path('tests/pages-verification')
out.mkdir(parents=True, exist_ok=True)
errors = []
report = {'url': base, 'expectedRevision': args.revision, 'assets': [],
          'pageErrors': errors, 'result': 'running',
          'limitations': ['Headless browser verification does not certify physical GPU behavior.']}
try:
    for attempt in range(18):
        try:
            request = urllib.request.Request(urljoin(base, 'version.json') + '?revision=' + args.revision,
                                             headers={'Cache-Control': 'no-cache'})
            with urllib.request.urlopen(request, timeout=20) as response:
                version = json.load(response)
            if version['revision'] != args.revision:
                raise RuntimeError('Pages edge still serves an earlier revision')
            report['version'] = version
            break
        except Exception:
            if attempt == 17:
                raise
            time.sleep(5)

    for path in ['index.html', 'app/main.js', 'app/style.css', 'diagnostics.html',
                 'packages/engine/src/index.js', 'packages/kernels/src/worker.js',
                 'packages/webgpu/src/shaders.js', 'TerraWeave.html',
                 'examples/exports/alpine-height.png', 'examples/exports/alpine-terrain.glb']:
        with urllib.request.urlopen(urljoin(base, path), timeout=30) as response:
            assert response.status == 200, path
            mime = response.headers.get_content_type()
            assert response.read(1), 'Empty asset: ' + path
            if path.endswith('.js'):
                assert 'javascript' in mime, (path, mime)
            report['assets'].append({'path': path, 'status': response.status, 'mime': mime})

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        try:
            page = browser.new_page(viewport={'width': 1600, 'height': 1000}, device_scale_factor=1)
            page.on('pageerror', lambda error: errors.append(str(error)))
            response = page.goto(base + '?fresh=1&revision=' + args.revision,
                                 wait_until='domcontentloaded', timeout=60000)
            assert response and response.status == 200
            page.wait_for_function('window.__terraweaveReady || window.__terraweaveFatal', timeout=120000)
            fatal = page.evaluate('window.__terraweaveFatal || null')
            assert not fatal, fatal
            page.wait_for_function('window.terraweave && terraweave.snapshot && !terraweave.busy', timeout=120000)
            report['application'] = page.evaluate('''async () => {
                const t = terraweave, a = t.snapshot.height;
                const { createPreset } = await import(new URL('packages/nodes/src/index.js', document.baseURI).href);
                const expected = createPreset('alpine');
                const nodes = list => list.map(n => [n.id, n.type]).sort((a, b) => a[0].localeCompare(b[0]));
                const edges = list => list.map(e => [e.from, e.port, e.to, e.input].join(':')).sort();
                const matchesStarterGraph = JSON.stringify(nodes(t.graph.nodes)) === JSON.stringify(nodes(expected.nodes))
                    && JSON.stringify(edges(t.graph.edges)) === JSON.stringify(edges(expected.edges))
                    && t.graph.project.output === expected.output;
                let minimum = Infinity, maximum = -Infinity, finite = true;
                for (const v of a) { finite = finite && Number.isFinite(v); minimum = Math.min(minimum, v); maximum = Math.max(maximum, v); }
                return { compute: t.engine.backend.kind, workerActive: !!t.engine.backend.worker,
                         workerFailure: t.engine.backend.workerFailure || null,
                         renderer: t.renderer.kind, resolution: t.snapshot.size, samples: a.length,
                         minimum, maximum, finite, nodes: t.graph.nodes.length,
                         expectedNodes: expected.nodes.length, matchesStarterGraph,
                         gpuErrors: [...t.gpuErrors] };
            }''')
            app = report['application']
            assert app['finite'] and app['samples'] == app['resolution'] ** 2, app
            assert app['maximum'] > app['minimum'], app
            assert app['matchesStarterGraph'], app
            assert not app['gpuErrors'], app['gpuErrors']
            page.screenshot(path=str(out / 'live-desktop.png'))
            page.set_viewport_size({'width': 430, 'height': 900})
            page.wait_for_timeout(300)
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'Mobile horizontal overflow'
            page.locator('#mobileInspector').click()
            assert page.evaluate('getComputedStyle(document.getElementById("inspector")).display !== "none"'), 'Mobile inspector did not open'
            page.locator('#mobileInspector').click()
            page.screenshot(path=str(out / 'live-mobile.png'))
            assert not errors, errors
        finally:
            browser.close()
    report['result'] = 'passed'
except Exception as exc:
    report['result'] = 'failed'
    report['failure'] = str(exc)
    raise
finally:
    (out / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2), flush=True)
