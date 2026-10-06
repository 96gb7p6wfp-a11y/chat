"""Build and exercise root and repository-path hosting in a real browser.

Requires Node/npm, Python Playwright, and /usr/bin/chromium.
Runs only a temporary local server; does not publish a website.
"""
import json
import subprocess
import shutil
import os
import tempfile
import functools
import threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
scratch = tempfile.TemporaryDirectory(prefix='northstar-hosting-')
site = Path(scratch.name)
server = None
try:
    for base_path, output in [('/', site), ('/chat/', site/'chat')]:
        build_env = dict(os.environ, NORTHSTAR_BASE_PATH=base_path)
        subprocess.run(['npm', 'run', 'build', '--', '--outDir', str(output), '--emptyOutDir'], cwd=ROOT, env=build_env, check=True)
    (site/'seed.html').write_text('<!doctype html><title>Cache isolation test</title>')
    class QuietHandler(SimpleHTTPRequestHandler):
        def log_message(self, format, *args):
            pass
    server = ThreadingHTTPServer(('127.0.0.1',0), functools.partial(QuietHandler, directory=str(site)))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base = f'http://127.0.0.1:{server.server_port}'
    (site / 'chat/assets/auth-only.js').write_text('/* test fixture */')
    (site / 'assets/outside-only.js').write_text('/* test fixture */')
    results = []
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
        context = browser.new_context(viewport={'width':390,'height':844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        page = context.new_page()
        errors=[]
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(base + '/seed.html')
        page.evaluate('''async () => {
          for (const key of ['northstar-shell-%2F-v0', 'northstar-shell-%2Fchat%2F-v0', 'another-app-cache']) {
            await caches.open(key);
          }
        }''')
        for prefix in ['/', '/chat/']:
            page.goto(base + prefix)
            expect(page.get_by_role('heading', name='Your daily plan')).to_be_visible()
            page.wait_for_function('(prefix) => navigator.serviceWorker.controller?.scriptURL === location.origin + prefix + "sw.js"', arg=prefix, timeout=15000)
            cache_name = 'northstar-shell-' + ('%2F' if prefix == '/' else '%2Fchat%2F') + '-v3'
            caches = page.evaluate('''async () => {
                const output={};
                for(const name of await caches.keys()) output[name]=(await(await caches.open(name)).keys()).map(r=>r.url);
                return output;
            }''')
            assert cache_name in caches, caches
            assert cache_name.replace('-v3','-v0') not in caches, caches
            assert 'another-app-cache' in caches, caches
            if prefix == '/':
                assert 'northstar-shell-%2Fchat%2F-v0' in caches, caches
            else:
                assert 'northstar-shell-%2F-v3' in caches, caches
            urls = caches[cache_name]
            assert all(url.startswith(base + prefix) and '?' not in url for url in urls), urls
            assert any(url.endswith('.woff2') for url in urls), urls
            manifest = page.evaluate('''async () => {
              const location=document.querySelector('link[rel="manifest"]').href;
              const manifest=await(await fetch(location)).json();
              return {location, id:new URL(manifest.id,location).href, start:new URL(manifest.start_url,location).href,
                scope:new URL(manifest.scope,location).href, icons:manifest.icons.map(i=>new URL(i.src,location).href)};
            }''')
            assert manifest['location'] == base + prefix + 'manifest.webmanifest', manifest
            assert manifest['id'] == manifest['start'] == manifest['scope'] == base + prefix, manifest
            assert all(url.startswith(base + prefix) for url in manifest['icons']), manifest
            context.set_offline(True)
            page.reload(wait_until='domcontentloaded')
            expect(page.get_by_role('heading',name='Your daily plan')).to_be_visible()
            for family in ['DM Sans', 'Libre Caslon Display']:
                loaded=page.evaluate('async family => (await document.fonts.load(`16px "${family}"`)).map(f=>f.status)',family)
                assert loaded and all(status=='loaded' for status in loaded), (prefix,family,loaded)
            context.set_offline(False)
            results.append({'test':prefix + ' manifest, iPhone layout, worker scope, cache cleanup, fonts and offline reload','passed':True})
        page.evaluate('''async () => {
          await Promise.all([
            fetch('/chat/api/private'), fetch('/chat/auth/callback'), fetch('/chat/data/private'),
            fetch('/chat/?token=nonsecret-test'), fetch('/chat/assets/auth-only.js',{headers:{Authorization:'Bearer nonsecret-test'}}),
            fetch('/assets/outside-only.js')
          ]);
        }''')
        chat_cached=page.evaluate('async () => (await(await caches.open("northstar-shell-%2Fchat%2F-v3")).keys()).map(r=>r.url)')
        assert all('?' not in url and not any(part in url for part in ['/api/','/auth/','/data/','auth-only','outside-only']) for url in chat_cached), chat_cached
        context.set_offline(True)
        excluded=page.evaluate('''async () => Promise.all(['/chat/api/private','/chat/auth/callback','/chat/data/private','/chat/?token=nonsecret-test','/assets/outside-only.js'].map(async url=>{try {await fetch(url,{cache:'no-store'});return false;}catch {return true;}}))''')
        assert all(excluded), excluded
        context.set_offline(False)
        results.append({'test':'/chat/ excluded query, authenticated, private and outside-scope requests','passed':True})
        assert errors == [], errors
        results.append({'test':'both deployments have no uncaught JavaScript errors','passed':True})
        browser.close()

    for candidate in ['/', '/chat/', '/demo/chat/']:
        completed=subprocess.run([shutil.which('node'),'--input-type=module','-e',"await import('./vite.config.js')"],cwd=ROOT,env={'PATH':'/usr/bin:/bin', 'NORTHSTAR_BASE_PATH':candidate},capture_output=True,text=True)
        assert completed.returncode==0,(candidate,completed.stderr)
    for candidate in ['', 'chat/', '/chat', '/../', '/chat//', '/chat/?x=1', 'https://example.com/', '/chat space/']:
        completed=subprocess.run([shutil.which('node'),'--input-type=module','-e',"await import('./vite.config.js')"],cwd=ROOT,env={'PATH':'/usr/bin:/bin', 'NORTHSTAR_BASE_PATH':candidate},capture_output=True,text=True)
        assert completed.returncode!=0 and 'NORTHSTAR_BASE_PATH must be' in completed.stderr,(candidate,completed.stderr)
    results.append({'test':'base accepts root/nested slash paths and rejects malformed paths','passed':True})
    print(json.dumps(results,indent=2))

finally:
    if server is not None:
        server.shutdown()
        server.server_close()
    scratch.cleanup()
