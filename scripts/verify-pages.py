"""Verify the deployed Pages revision and boot the real public application.

Developer-only dependencies: Python Playwright + Chromium. No app dependencies.
Usage: python scripts/verify-pages.py <site-url> <expected-git-sha>
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

report = {'url': base, 'expectedRevision': args.revision, 'assets': []}
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

out = Path('tests/pages-verification')
out.mkdir(parents=True, exist_ok=True)
errors = []
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=['--enable-unsafe-swiftshader'])
    page = browser.new_page(viewport={'width': 1600, 'height': 1000}, device_scale_factor=1)
    page.on('pageerror', lambda error: errors.append(str(error)))
    response = page.goto(base + '?revision=' + args.revision, wait_until='domcontentloaded', timeout=60000)
    assert response and response.status == 200
    page.wait_for_function('window.__terraweaveReady || window.__terraweaveFatal', timeout=120000)
    fatal = page.evaluate('window.__terraweaveFatal || null')
    assert not fatal, fatal
    page.wait_for_function('window.terraweave && !terraweave.busy', timeout=120000)
    report['application'] = page.evaluate('''() => {
        const t = terraweave, a = t.snapshot.height.data;
        let minimum = Infinity, maximum = -Infinity, finite = true;
        for (const v of a) { finite = finite && Number.isFinite(v); minimum = Math.min(minimum, v); maximum = Math.max(maximum, v); }
        return { compute: t.engine.backend.kind, renderer: t.renderer.kind,
                 resolution: t.snapshot.height.n, samples: a.length, minimum, maximum, finite,
                 nodes: t.graph.project.nodes.length, gpuErrors: [...t.gpuErrors] };
    }''')
    app = report['application']
    assert app['finite'] and app['samples'] > 0 and app['maximum'] > app['minimum'], app
    assert app['nodes'] == 6, app
    page.screenshot(path=str(out / 'live-desktop.png'))
    page.set_viewport_size({'width': 430, 'height': 900})
    page.wait_for_timeout(300)
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'Mobile horizontal overflow'
    page.screenshot(path=str(out / 'live-mobile.png'))
    report['pageErrors'] = errors
    (out / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
    browser.close()
assert not errors, errors
print(json.dumps(report, indent=2))
