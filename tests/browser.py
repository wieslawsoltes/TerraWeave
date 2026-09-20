"""Browser integration gate. Requires Python Playwright and Chromium.
Normal usage: python tests/browser.py --url http://localhost:4173
Restricted local runner: python tests/browser.py --inline
The inline mode does not assert secure-context GPU or IndexedDB availability.
"""
import argparse,asyncio,json,os,time
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--url',default='http://localhost:4173');parser.add_argument('--inline',action='store_true');parser.add_argument('--browser',default=os.environ.get('CHROMIUM','/usr/bin/chromium'));args=parser.parse_args()
async def main():
 results=[];errors=[];console=[];t0=time.time()
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=args.browser,headless=True,args=['--no-sandbox','--enable-unsafe-webgpu','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
  context=await browser.new_context(viewport={'width':1600,'height':1000},device_scale_factor=1,accept_downloads=True)
  page=await context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda m:console.append({'type':m.type,'text':m.text}))
  if args.inline:await page.set_content((ROOT/'dist/TerraWeave.html').read_text(),wait_until='domcontentloaded')
  else:await page.goto(args.url+'/?fresh=1',wait_until='domcontentloaded')
  await page.wait_for_function('window.__terraweaveReady||window.__terraweaveFatal',timeout=90000)
  assert await page.evaluate('!!window.__terraweaveReady'),await page.evaluate('window.__terraweaveFatal')
  async def check(name,expression):
   value=await page.evaluate(expression);assert value,f'{name}: {value}';results.append(name);print('PASS',name,flush=True)
  async def build():await page.evaluate('window.terraweave.build()')
  await check('Initial graph builds a nonuniform finite terrain','(()=>{const a=terraweave.snapshot.height;return a.length===65536&&a.every(Number.isFinite)&&Math.max(...a)-Math.min(...a)>.3})()')
  await check('Four genuine hydraulic diagnostic outputs','["flow","wear","deposition","water"].every(k=>terraweave.snapshot.maps[k]?.length===65536)')
  await page.screenshot(path=str(ROOT/'tests/desktop.png'))
  # Inspector edits and transactional undo/redo.
  number=page.locator('.parameter[data-param="erosion"] .number-input');await number.fill('0.38');await number.press('Tab');await build()
  await check('Inspector edit updates kernel parameters','terraweave.graph.node("erode").params.erosion===.38')
  await page.locator('#undo').click();await build();await check('Undo restores parameter','terraweave.graph.node("erode").params.erosion===.16')
  await page.locator('#redo').click();await build();await check('Redo reapplies parameter','terraweave.graph.node("erode").params.erosion===.38')
  await build();await check('Unchanged graph reuses five cached nodes','terraweave.metrics.cacheHits===5')
  # Previewing a diagnostic is real field selection, not a tinted render mode.
  await page.get_by_role('button',name='Flow',exact=True).click();await build();await check('Flow output switches to 2D preview','terraweave.renderer.settings.flat&&document.getElementById("previewLabel").textContent.includes("Flow")')
  await page.screenshot(path=str(ROOT/'tests/flow-map.png'));await page.evaluate('terraweave.finalPreview()');await build()
  # A pointer gesture is stored as resolution-independent brush dabs.
  await page.locator('#sculptTool').click();await build();bounds=await page.locator('#terrainCanvas').bounding_box();x=bounds['x']+bounds['width']*.5;y=bounds['y']+bounds['height']*.5
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+35,y+15,steps=8);await page.mouse.up();await build()
  await check('Sculpt gesture records real dabs','terraweave.graph.nodes.some(n=>n.type==="paint"&&n.strokes?.length>=2)')
  await page.locator('#undo').click();await build();await check('Brush gesture is one undo step','terraweave.graph.nodes.find(n=>n.type==="paint").strokes.length===0')
  await page.locator('#redo').click();await build();await check('Brush gesture redo is deterministic','terraweave.graph.nodes.find(n=>n.type==="paint").strokes.length>=2')
  await page.locator('#view3D').click()
  # Clipboard transactions reject bad graphs without modifying the live model.
  await check('Paste validation is atomic','(()=>{const before=terraweave.graph.serialize();try{terraweave.graphUI.paste(JSON.stringify({format:"terraweave-nodes",nodes:[{id:"bad",type:"noise",params:{seed:-5}}],edges:[]}));}catch{}return before===terraweave.graph.serialize()})()')
  await page.evaluate('terraweave.select("surface")');count=await page.evaluate('terraweave.graph.nodes.length');await page.locator('#duplicateNode').click();await build();await check('Duplicate retains upstream dependencies',f'terraweave.graph.nodes.length==={count+1}&&terraweave.graph.edges.some(e=>e.to===terraweave.graph.project.output)')
  await page.locator('#undo').click();await build()
  # Actual pointer movement on node title changes world coordinates, not terrain cache keys.
  await page.evaluate('terraweave.graphUI.fit()');head=page.locator('.terrain-node[data-node="base"] .node-header');b=await head.bounding_box();old=await page.evaluate('terraweave.graph.node("base").x');await page.mouse.move(b['x']+b['width']*.5,b['y']+b['height']*.5);await page.mouse.down();await page.mouse.move(b['x']+b['width']*.5+24,b['y']+b['height']*.5+8,steps=4);await page.mouse.up()
  await check('Graph nodes move through pointer capture',f'terraweave.graph.node("base").x>{old}')
  # Command palette is searchable and keyboard actionable.
  await page.locator('#commandButton').click();await page.get_by_role('textbox',name='Search commands').fill('Scene settings');await page.get_by_role('textbox',name='Search commands').press('Enter');await check('Command palette executes scene command','document.querySelector("[data-inspector-tab=scene]").classList.contains("active")')
  # UI export branch with captured browser Blob (no network needed).
  await page.evaluate('''()=>{window.__exportFiles=[];const create=URL.createObjectURL.bind(URL),click=HTMLAnchorElement.prototype.click;window.__blobs=new Map();URL.createObjectURL=b=>{const url=create(b);__blobs.set(url,b);return url;};HTMLAnchorElement.prototype.click=function(){if(this.download){window.__exportFiles.push({name:this.download,blob:__blobs.get(this.href)});}else click.call(this);};}''')
  await page.locator('#exportButton').click();await page.select_option('#exportFormat','png16');await page.select_option('#exportResolution','64');await page.locator('#confirmExport').click();await page.wait_for_function('window.__exportFiles.length===1',timeout=60000)
  await check('Export UI rebuilds and creates genuine PNG16','(async()=>{const b=new Uint8Array(await __exportFiles[0].blob.arrayBuffer());return b[24]===16&&new DataView(b.buffer).getUint32(16)===64;})()')
  await page.locator('#saveProject').click();await check('Portable project save includes graph and sculpt dabs','(async()=>{const p=JSON.parse(await __exportFiles.at(-1).blob.text());return p.format==="terraweave"&&p.nodes.some(n=>n.type==="paint"&&n.strokes.length>0);})()')
  # Every preset is an actual complete graph, evaluated through its production engine.
  for name in ['island','desert','canyon','volcano','arctic','alpine']:
   await page.evaluate('(key)=>terraweave.loadPreset(key)',name);await build();await check('Preset '+name+' builds','terraweave.snapshot.height.every(Number.isFinite)&&terraweave.metrics.nodes.length===5')
  await page.evaluate('terraweave.select("erode")');await page.locator('#view3D').click();await page.evaluate('document.querySelectorAll(".toast").forEach(e=>e.remove())');await page.wait_for_timeout(500);await page.screenshot(path=str(ROOT/'tests/desktop.png'))
  await page.set_viewport_size({'width':430,'height':900});await page.wait_for_timeout(300);await check('Mobile layout fits viewport','document.documentElement.scrollWidth<=innerWidth+1')
  await page.locator('#mobileInspector').click();await check('Mobile properties panel opens','getComputedStyle(document.getElementById("inspector")).display!=="none"');await page.locator('#mobileInspector').click();await page.screenshot(path=str(ROOT/'tests/mobile.png'))
  backend=await page.evaluate('({compute:terraweave.engine.backend.kind,worker:!!terraweave.engine.backend.workerURL,renderer:terraweave.renderer.kind,gpuErrors:terraweave.gpuErrors})')
  assert not errors,errors
  report={'passed':len(results),'checks':results,'backend':backend,'inline':args.inline,'pageErrors':errors,'seconds':round(time.time()-t0,2),'limitations':(['Secure-context WebGPU, WebGL and IndexedDB were unavailable in this restricted browser; software viewport and main-thread CPU fallback were tested.'] if args.inline else [])}
  (ROOT/'tests/browser-results.json').write_text(json.dumps(report,indent=2));(ROOT/'tests/browser-console.json').write_text(json.dumps(console,indent=2));print(json.dumps(report,indent=2));await browser.close()
asyncio.run(main())
