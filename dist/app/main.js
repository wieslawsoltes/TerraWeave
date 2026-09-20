import { Graph, History, retainPacket, releasePacket, selectPort } from '../packages/core/src/index.js';
import { registry, categories, defaults, createPreset, presetDescriptions, portLabels } from '../packages/nodes/src/index.js';
import { CpuBackend, runCPU } from '../packages/kernels/src/index.js';
import { GpuBackend, createGPUDevice } from '../packages/webgpu/src/index.js';
import { TerrainEngine } from '../packages/engine/src/index.js';
import { createRenderer } from '../packages/renderer/src/index.js';
import { GraphEditor } from '../packages/graph-ui/src/index.js';
import { icon, el, escapeHTML, iconButton, parameterPanel, parameterControl, toast, modal, menu, histogram, terrainThumbnail, resizer } from '../packages/ui/src/index.js';
import { ProjectStore, download, importImage, encodePNG16, encodePNG8, raw16, raw32, encodeEXR, normalMap, colorMap, splatMap, encodeOBJ, encodeGLB, exportBundle } from '../packages/io/src/index.js';
import { statistics, clamp, sample } from '../packages/math/src/index.js';
const $ = id => document.getElementById(id);
for (const element of document.querySelectorAll('[data-icon]'))
    element.innerHTML = icon(element.dataset.icon);
const history = new History(70), store = new ProjectStore(), workerURL = new URL('../packages/kernels/src/worker.js', import.meta.url);
const query = new URLSearchParams(location.search);
let graph = new Graph(registry, createPreset('alpine')), graphUI, engine, renderer, gpuInfo = null;
let currentPacket = null, currentSnapshot = null, viewSnapshot = null, lastStats = null, lastMetrics = null;
let selected = 'erode', inspectorTab = 'properties', libraryTab = 'all', preview = { id: null, port: 'height' };
let dirty = false, busy = false, autoBuild = true, buildTimer = 0, saveTimer = 0, requestSerial = 0, booted = false, clipboard = '';
let sculptNode = null, strokeActive = false, strokeLast = null, sculptListeners = null, importTarget = null;
const expanded = new Set(['Terrain', 'Simulate']), favorites = new Set(readLocal('terraweave-favorites', ['mountain', 'hydraulic', 'biome', 'terrace']));
const gpuErrors = [];
function readLocal(key, fallback) { try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
}
catch {
    return fallback;
} }
function writeLocal(key, value) { try {
    localStorage.setItem(key, JSON.stringify(value));
}
catch { } }
function status(text, type = 'ready') { $('statusText').textContent = text; $('stateDot').className = 'state-dot' + (type === 'busy' ? ' busy' : type === 'error' ? ' error' : ''); }
function checkpoint(label = 'Edit') { history.checkpoint(graph.project, label); updateHistory(); }
function updateHistory() { $('undo').disabled = !history.undoStack.length; $('redo').disabled = !history.redoStack.length; }
function markDirty({ build = false, delay = 160 } = {}) { dirty = true; $('dirtyDot').classList.add('visible'); updateHistory(); scheduleSave(); if (build)
    scheduleBuild(delay); }
function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(async () => { try {
    await store.set(structuredClone(graph.project));
    $('autosaveStatus').textContent = 'Saved locally on this device';
}
catch (error) {
    $('autosaveStatus').textContent = 'Autosave unavailable · save a file';
    console.warn('Autosave:', error);
} }, 650); }
function updateProjectUI() {
    $('projectName').value = graph.project.name;
    $('terrainTitle').textContent = graph.project.name;
    $('resolution').value = String(graph.project.resolution);
    const km = graph.project.worldSize / 1000;
    $('worldDimensions').textContent = km >= 1 ? `${km.toFixed(1)} × ${km.toFixed(1)} km` : `${graph.project.worldSize} × ${graph.project.worldSize} m`;
    $('scaleLabel').textContent = graph.project.worldSize.toLocaleString() + ' m terrain extent';
    $('graphCount').textContent = `${graph.nodes.length} nodes`;
    $('terrainSubtitle').textContent = `${graph.project.worldSize.toLocaleString()} m extent · ${graph.project.elevation.toLocaleString()} m elevation range`;
    $('sampleStats').textContent = `${graph.project.resolution} × ${graph.project.resolution}`;
    updatePreviewLabel();
    syncScene();
}
function updatePreviewLabel() { const id = preview.id || graph.project.output, node = graph.node(id); $('previewLabel').textContent = preview.id ? `${node?.name || 'NODE'} / ${portLabels[preview.port] || preview.port}` : 'FINAL SURFACE'; }
function syncScene() {
    if (!renderer)
        return;
    const v = graph.project.view || {}, safe = (key, def, min, max) => clamp(Number.isFinite(v[key]) ? v[key] : def, min, max);
    renderer.setSettings({ heightScale: 2 * graph.project.elevation / graph.project.worldSize * safe('exaggeration', 1, .1, 5), waterLevel: safe('waterLevel', .03, 0, 1), sunAzimuth: safe('sunAzimuth', 135, 0, 360), sunAltitude: safe('sunAltitude', 42, 1, 89), exposure: safe('exposure', 1.04, .2, 4), palette: safe('palette', 0, 0, 4), snowLine: safe('snowLine', .6, 0, 1), water: v.water !== false, grid: v.grid !== false, shadows: v.shadows !== false, contours: v.contours === true });
    for (const [id, key] of [['toggleWater', 'water'], ['toggleGrid', 'grid'], ['toggleShadows', 'shadows'], ['toggleContours', 'contours']]) {
        const b = $(id);
        b.classList.toggle('active', renderer.settings[key]);
        b.setAttribute('aria-pressed', String(renderer.settings[key]));
    }
}
function errorToast(error, heading = 'Operation failed') { console.error(error); toast(heading, { type: 'error', detail: error.message || String(error), duration: 11000 }); status(error.message || String(error), 'error'); }
function setBusy(value) { busy = value; $('buildButton').disabled = value; $('cancelBuild').hidden = !value; $('buildProgress').classList.toggle('running', value); }
function progress(p) { $('buildProgressFill').style.width = `${p.fraction * 100}%`; status(`${p.name} · ${Math.round(p.fraction * 100)}%`, 'busy'); graphUI?.setStatus(p.node, p.status); $('loadingDetail').textContent = p.name + '…'; }
function scheduleBuild(delay = 160) { clearTimeout(buildTimer); if (!booted || !autoBuild) {
    if (booted)
        status('Changes pending · press B to build');
    return;
} buildTimer = setTimeout(() => buildTerrain(), delay); }
async function buildTerrain({ fallback = true } = {}) {
    clearTimeout(buildTimer);
    const serial = ++requestSerial;
    if (!graph.project.output && !preview.id) {
        engine?.cancel();
        setBusy(false);
        releasePacket(currentPacket);
        currentPacket = null;
        currentSnapshot = null;
        viewSnapshot = null;
        lastStats = null;
        renderer?.clear?.();
        $('loadingSplash').hidden = true;
        status('Add a generator to start a terrain');
        return;
    }
    const id = graph.node(preview.id) ? preview.id : graph.project.output;
    if (preview.id && !graph.node(preview.id))
        preview = { id: null, port: 'height' };
    setBusy(true);
    $('buildProgressFill').style.width = '0%';
    const started = performance.now();
    let built = null;
    try {
        built = await engine.build(graph, { target: id, onProgress: progress });
        if (serial !== requestSerial) {
            releasePacket(built.result);
            return;
        }
        const plain = await engine.backend.read(built.result);
        if (serial !== requestSerial) {
            releasePacket(built.result);
            return;
        }
        if (preview.port !== 'height' && preview.port !== 'color' && !plain.maps[preview.port])
            preview.port = 'height';
        const view = selectPort(built.result, preview.port), snapshot = (preview.port === 'height' || preview.port === 'color') ? plain : { size: plain.size, height: plain.maps[preview.port], maps: {}, color: null };
        lastStats = statistics(snapshot.height);
        renderer.setTerrain(view, snapshot);
        renderer.setRange(lastStats.min, lastStats.max);
        releasePacket(currentPacket);
        currentPacket = built.result;
        built = null;
        currentSnapshot = plain;
        viewSnapshot = snapshot;
        lastMetrics = { ...engine.lastMetrics, wallMs: performance.now() - started };
        $('loadingSplash').hidden = true;
        if (engine.backend.workerFailure)
            $('computeBadge').textContent = 'CPU · main thread';
        $('cacheStats').textContent = `${(engine.memoryUsage() / 1048576).toFixed(1)} MB cache`;
        $('sampleStats').textContent = `${plain.size} × ${plain.size}`;
        const cached = lastMetrics.cacheHits;
        status(`Built ${graph.node(id)?.name || 'terrain'} · ${Math.round(lastMetrics.wallMs)} ms${cached ? ` · ${cached} cached` : ''}`);
        $('graphBuildSummary').textContent = `${Math.round(lastMetrics.wallMs)} ms · ${cached ? `${cached} cached` : 'up to date'}`;
        for (const m of lastMetrics.nodes)
            graphUI.setStatus(m.id, m.cached ? 'cached' : 'done', m.ms);
        updatePreviewLabel();
        refreshStatistics();
        if (inspectorTab === 'build')
            renderInspector();
        refreshThumbnails(serial);
        window.__terraweaveReady = true;
    }
    catch (error) {
        if (built)
            releasePacket(built.result);
        if (error.name === 'AbortError') {
            if (serial === requestSerial)
                status('Build cancelled');
            return;
        }
        if (serial !== requestSerial)
            return;
        $('loadingSplash').hidden = true;
        errorToast(error, 'Terrain build failed');
        if (fallback && engine.backend.kind === 'WebGPU' && !currentPacket) {
            toast('Switching compute to the CPU worker', { detail: 'The renderer remains available. GPU details are recorded in the browser console.' });
            await switchBackend('cpu', { rebuild: false });
            return buildTerrain({ fallback: false });
        }
    }
    finally {
        if (serial === requestSerial)
            setBusy(false);
    }
}
async function refreshThumbnails(serial) { for (const node of graph.nodes) {
    if (serial !== requestSerial)
        return;
    const result = engine.getNodeResult(node.id);
    if (!result)
        continue;
    const held = retainPacket(result);
    try {
        const data = await engine.backend.readRaster(held.height), color = held.color ? await engine.backend.readRaster(held.color) : null;
        if (serial !== requestSerial)
            return;
        graphUI.setThumbnail(node.id, data, result.size, { colors: color, mask: registry[node.type].category === 'Derive' });
    }
    catch (e) {
        console.warn('Thumbnail:', e);
    }
    finally {
        releasePacket(held);
    }
} }
function refreshStatistics() { const canvas = $('heightHistogram'); if (canvas && lastStats) {
    histogram(canvas, lastStats.histogram);
    for (const [k, v] of Object.entries({ min: lastStats.min, max: lastStats.max, mean: lastStats.mean })) {
        const field = $('stat-' + k);
        if (field)
            field.textContent = v.toFixed(4);
    }
} }
function viewMode(flat) { if (!flat)
    exitSculpt(); renderer?.setSettings({ flat }); $('view3D').classList.toggle('active', !flat); $('view2D').classList.toggle('active', flat); }
function previewNode(id, port = 'height') { if (!graph.node(id))
    return; preview = { id, port }; if (port !== 'height') {
    viewMode(true);
    renderer?.setSettings({ mode: port === 'color' ? 0 : 1 });
    $('displayMode').value = port === 'color' ? '0' : '1';
} updatePreviewLabel(); buildTerrain(); renderInspector(); }
function finalPreview() { preview = { id: null, port: 'height' }; updatePreviewLabel(); buildTerrain(); }
function setOutput(id) { if (!graph.node(id))
    return; checkpoint('Set output'); graph.project.output = id; preview = { id: null, port: 'height' }; graphUI.refresh(); markDirty({ build: true, delay: 0 }); renderInspector(); }
function changeGraph(kind) { if (!graph.node(selected))
    selected = graphUI.primary; if (preview.id && !graph.node(preview.id))
    preview = { id: null, port: 'height' }; updateProjectUI(); if (kind !== 'layout')
    renderInspector(); markDirty({ build: kind !== 'layout', delay: 50 }); }
function replaceProject(project, { historyLabel = null, preserveHistory = true } = {}) { const next = new Graph(registry, structuredClone(project)); if (historyLabel)
    checkpoint(historyLabel); if (!preserveHistory)
    history.clear(); exitSculpt(); engine?.cancel(); graph = next; preview = { id: null, port: 'height' }; selected = graph.node('erode') ? 'erode' : graph.project.output; graphUI.setGraph(graph); if (selected)
    graphUI.select(selected); updateProjectUI(); renderInspector(); requestAnimationFrame(() => graphUI.fit()); markDirty({ build: true, delay: 10 }); }
function undo() { const p = history.undo(graph.project); if (p) {
    replaceProject(p);
    updateHistory();
    status('Undo');
} }
function redo() { const p = history.redo(graph.project); if (p) {
    replaceProject(p);
    updateHistory();
    status('Redo');
} }
function saveProject() { download(graph.serialize(), `${fileStem()}.terraweave.json`, 'application/json'); dirty = false; $('dirtyDot').classList.remove('visible'); status('Project file saved'); scheduleSave(); }
function fileStem() { return graph.project.name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'terrain'; }
function newProject() { const p = createPreset('alpine'); p.name = 'Untitled terrain'; p.nodes = []; p.edges = []; p.output = null; replaceProject(p, { historyLabel: 'New project' }); status('Choose a generator from the node library'); }
function loadPreset(key) { replaceProject(createPreset(key), { historyLabel: 'Load starter world' }); viewMode(false); renderer.camera.reset(); toast(graph.project.name, { detail: presetDescriptions[key], duration: 4000 }); }
function addNode(type, position = null, { connect = true } = {}) { if (!registry[type])
    return; checkpoint('Add ' + registry[type].label); const source = graph.node(selected) || graph.node(graph.project.output), oldOutput = graph.project.output, d = registry[type]; const at = position || (source ? { x: source.x + 230, y: source.y } : graphUI.visibleCenter()); const node = graph.add(type, Math.round(at.x), Math.round(at.y)); if (connect && source && d.inputs.includes('a'))
    graph.connect(source.id, 'height', node.id, 'a'); if (d.category === 'Derive' && oldOutput)
    graph.project.output = oldOutput; selected = node.id; graphUI.refresh(); graphUI.select(node.id); if (d.category === 'Derive') {
    preview = { id: node.id, port: 'height' };
    viewMode(true);
    renderer.setSettings({ mode: 1 });
    $('displayMode').value = '1';
}
else
    preview = { id: null, port: 'height' }; changeGraph('graph'); if (type === 'import') {
    importTarget = node.id;
    $('heightFile').click();
} return node; }
function reseed() { checkpoint('Reseed terrain'); let count = 0; for (const node of graph.nodes)
    if ('seed' in node.params) {
        node.params.seed = Math.floor(Math.random() * 65536);
        count++;
    } if (count) {
    renderInspector();
    markDirty({ build: true });
    toast('New procedural seed', { detail: `Updated ${count} seed-driven nodes. Undo restores the previous terrain.` });
} }
function makeGraph() { graphUI = new GraphEditor($('graphCanvas'), graph, { onBeforeChange: checkpoint, onChange: changeGraph, onSelect: id => { selected = id; inspectorTab = 'properties'; renderInspector(); }, onPreview: previewNode, onView: view => $('graphZoom').textContent = `${Math.round(view.zoom * 100)}%`, onAddMenu: position => commands(position), onAdd: (type, pos) => addNode(type, pos, { connect: false }), onError: e => errorToast(e, 'Connection rejected'), onContextMenu: e => graphContext(e) }); }
function graphContext(e) { menu({ x: e.clientX, y: e.clientY }, [{ label: 'Add node…', icon: 'plus', shortcut: 'Tab', action: () => commands(graphUI.toWorld(e.clientX, e.clientY)) }, { label: 'Preview selected', icon: 'eye', shortcut: 'Space', disabled: !selected, action: () => previewNode(selected) }, { label: 'Set selected as output', icon: 'output', disabled: !selected, action: () => setOutput(selected) }, { separator: true }, { label: 'Duplicate', icon: 'copy', shortcut: '⌘ D', disabled: !selected, action: () => graphUI.duplicateSelected() }, { label: 'Delete', icon: 'trash', shortcut: 'Delete', disabled: !selected, action: () => graphUI.deleteSelected() }, { separator: true }, { label: 'Fit graph', icon: 'fit', shortcut: 'Home', action: () => graphUI.fit() }]); }
function renderLibrary() { const search = $('nodeSearch').value.toLowerCase().trim(), root = $('nodeLibrary'); root.replaceChildren(); let total = 0; for (const [category, meta] of Object.entries(categories)) {
    const nodes = Object.entries(registry).filter(([type, d]) => d.category === category && (libraryTab !== 'favorites' || favorites.has(type)) && (!search || `${d.label} ${type} ${d.description}`.toLowerCase().includes(search)));
    if (!nodes.length)
        continue;
    total += nodes.length;
    const section = el('section', 'node-category' + (search || expanded.has(category) ? ' open' : ''));
    section.style.setProperty('--category-color', meta.color);
    const head = el('button', 'category-heading');
    head.type = 'button';
    head.append(el('i'), el('span', '', category), el('span', '', String(nodes.length)));
    const arrow = el('span');
    arrow.innerHTML = icon('chevron', 12);
    head.append(arrow);
    head.addEventListener('click', () => { if (expanded.has(category))
        expanded.delete(category);
    else
        expanded.add(category); renderLibrary(); });
    section.append(head);
    const grid = el('div', 'category-nodes');
    for (const [type, d] of nodes) {
        const tile = el('button', 'library-node');
        tile.type = 'button';
        tile.draggable = true;
        tile.title = d.description;
        tile.dataset.nodeType = type;
        tile.setAttribute('aria-label', 'Add ' + d.label);
        const symbol = el('span', 'node-tile-icon');
        symbol.innerHTML = icon(d.icon, 22);
        const star = el('span', 'favorite-toggle' + (favorites.has(type) ? ' saved' : ''), '☆');
        star.title = 'Toggle favorite';
        star.addEventListener('click', e => { e.stopPropagation(); if (favorites.has(type))
            favorites.delete(type);
        else
            favorites.add(type); writeLocal('terraweave-favorites', [...favorites]); renderLibrary(); });
        tile.append(symbol, el('span', '', d.label), star);
        tile.addEventListener('click', () => addNode(type));
        tile.addEventListener('dragstart', e => { e.dataTransfer.setData('application/x-terraweave-node', type); e.dataTransfer.effectAllowed = 'copy'; });
        grid.append(tile);
    }
    section.append(grid);
    root.append(section);
} if (!total)
    root.append(el('div', 'empty-library', 'No nodes found. Try another search.')); $('nodeCount').textContent = Object.keys(registry).length; }
async function renderPresets() { const names = { alpine: 'Alpine', island: 'Islands', desert: 'Dunes', canyon: 'Canyon', volcano: 'Volcano', arctic: 'Arctic' }, root = $('presetGrid'); for (const [key, label] of Object.entries(names)) {
    const b = el('button', 'preset-card');
    b.title = presetDescriptions[key];
    b.setAttribute('aria-label', 'Load ' + label + ' starter world');
    const canvas = el('canvas');
    canvas.width = 112;
    canvas.height = 72;
    b.append(canvas, el('span', '', label));
    b.addEventListener('click', () => loadPreset(key));
    root.append(b);
    const p = createPreset(key), node = p.nodes[0];
    const result = await runCPU(node, {}, 64, p);
    terrainThumbnail(canvas, result.height.data, 64);
    releasePacket(result);
} }
function renderInspector() {
    for (const tab of document.querySelectorAll('[data-inspector-tab]')) {
        const active = tab.dataset.inspectorTab === inspectorTab;
        tab.classList.toggle('active', active);
        tab.setAttribute('aria-selected', String(active));
    }
    const body = $('inspectorBody');
    body.replaceChildren();
    if (inspectorTab === 'scene') {
        renderScene(body);
        return;
    }
    if (inspectorTab === 'build') {
        renderBuild(body);
        return;
    }
    const node = graph.node(selected);
    if (!node) {
        const blank = el('div', 'inspector-placeholder');
        blank.innerHTML = icon('nodes', 42);
        blank.append(el('h3', '', 'Every world starts here'), el('p', '', 'Select a node to edit its parameters. Connect generators, simulations and surface nodes to shape a landscape.'));
        body.append(blank);
        return;
    }
    const d = registry[node.type], color = categories[d.category].color, identity = el('div', 'property-identity');
    identity.style.setProperty('--node-color', color);
    const symbol = el('span', 'property-icon');
    symbol.innerHTML = icon(d.icon, 25);
    const names = el('div', 'property-heading-text'), name = el('input', 'property-name');
    name.value = node.name;
    name.maxLength = 80;
    name.setAttribute('aria-label', 'Node name');
    name.addEventListener('change', () => { checkpoint('Rename node'); node.name = name.value.trim() || d.label; graphUI.refresh(); markDirty(); updatePreviewLabel(); });
    names.append(name, el('div', 'property-breadcrumb', `${d.category} / ${d.label}`));
    identity.append(symbol, names);
    body.append(identity, el('p', 'property-description', d.description));
    const actions = el('div', 'property-actions');
    const pv = el('button', 'button');
    pv.innerHTML = icon('eye', 13) + '<span>Preview</span>';
    pv.onclick = () => previewNode(node.id);
    const out = el('button', 'button');
    out.innerHTML = icon('output', 13) + `<span>${graph.project.output === node.id ? 'Final output' : 'Set output'}</span>`;
    out.onclick = () => setOutput(node.id);
    actions.append(pv, out);
    body.append(actions);
    const enabled = el('div', 'enabled-row');
    enabled.append(el('span', '', 'PARAMETERS'));
    const label = el('label', 'auto-build'), check = el('input');
    check.type = 'checkbox';
    check.checked = node.enabled !== false;
    check.setAttribute('aria-label', 'Enable node');
    check.onchange = () => { checkpoint('Toggle node'); node.enabled = check.checked; graphUI.refresh(); markDirty({ build: true, delay: 0 }); };
    label.append(check, el('span', 'toggle-track'), document.createTextNode('Enabled'));
    enabled.append(label);
    body.append(enabled);
    body.append(parameterPanel(node, { onBegin: () => checkpoint('Adjust ' + node.name), onChange: (key, value, commit) => { node.params[key] = value; markDirty({ build: true, delay: commit ? 50 : 190 }); } }));
    if (node.type === 'import') {
        const button = el('button', 'button subtle full', 'Choose heightfield…');
        button.onclick = () => { importTarget = node.id; $('heightFile').click(); };
        body.append(button);
        if (node.asset)
            body.append(el('p', 'stat-caption', `${node.asset.size} × ${node.asset.size} embedded samples · ${node.asset.precision || 32}-bit source`));
    }
    if (node.type === 'paint') {
        const tools = el('div', 'property-actions'), start = el('button', 'button', 'Sculpt in 2D'), clear = el('button', 'button', 'Clear strokes');
        start.onclick = () => enterSculpt(node.id);
        clear.onclick = () => { checkpoint('Clear brush strokes'); node.strokes = []; markDirty({ build: true, delay: 0 }); renderInspector(); };
        tools.append(start, clear);
        body.append(tools, el('p', 'stat-caption', `${node.strokes?.length || 0} non-destructive brush dabs. Each gesture is one undo step.`));
    }
    if (!Object.keys(d.params).length)
        body.append(el('p', 'stat-caption', node.type === 'output' ? 'This node passes through the terrain, surface color, and available simulation maps.' : 'No additional parameters. Connect a terrain to evaluate this node.'));
    const outputs = el('section', 'inspector-section');
    outputs.append(el('div', 'inspector-section-title', 'OUTPUT CHANNELS'));
    const chips = el('div', 'output-chips');
    for (const port of d.outputs) {
        const b = el('button', 'output-chip' + (preview.id === node.id && preview.port === port ? ' active' : ''), portLabels[port] || port);
        b.onclick = () => previewNode(node.id, port);
        chips.append(b);
    }
    outputs.append(chips);
    body.append(outputs);
    const stats = el('section', 'inspector-section');
    stats.append(el('div', 'inspector-section-title', 'VIEWPORT HEIGHT DISTRIBUTION'));
    const hist = el('canvas', 'histogram-canvas');
    hist.id = 'heightHistogram';
    hist.width = 256;
    hist.height = 55;
    stats.append(hist);
    const grid = el('div', 'stats-grid');
    for (const [k, label] of [['min', 'Minimum'], ['max', 'Maximum'], ['mean', 'Mean']]) {
        const box = el('div', 'stat-item');
        box.append(el('span', '', label));
        const value = el('strong', '', '—');
        value.id = 'stat-' + k;
        box.append(value);
        grid.append(box);
    }
    stats.append(grid, el('p', 'stat-caption', 'Normalized field values. Raw and EXR exports retain floating-point precision.'));
    body.append(stats);
    refreshStatistics();
}
const numeric = (label, value, min, max, step = .01) => ({ label, default: value, min, max, step, kind: 'number' });
function renderScene(body) {
    body.append(el('h2', 'inspector-title', 'Scene & environment'), el('p', 'inspector-intro', 'World dimensions drive slope and thermal transport. Lighting and water settings affect the viewport only.'));
    for (const [key, label, min, max, step] of [['worldSize', 'Terrain extent (m)', 500, 20000, 100], ['elevation', 'Elevation range (m)', 100, 8000, 50]])
        body.append(parameterControl(key, numeric(label, graph.project[key], min, max, step), graph.project[key], { onBegin: () => checkpoint('Change world dimensions'), onChange: value => { graph.project[key] = value; updateProjectUI(); markDirty({ build: true }); } }));
    const title = el('div', 'inspector-section-title', 'VIEWPORT');
    title.style.marginTop = '22px';
    body.append(title);
    const v = graph.project.view || (graph.project.view = {});
    for (const [key, label, def, min, max, step] of [['exaggeration', 'Vertical exaggeration', 1, .25, 3, .05], ['sunAzimuth', 'Sun azimuth', 135, 0, 360, 1], ['sunAltitude', 'Sun altitude', 42, 5, 85, 1], ['exposure', 'Exposure', 1.04, .3, 2.5, .01], ['waterLevel', 'Sea level', .03, 0, 1, .005]]) {
        body.append(parameterControl(key, numeric(label, def, min, max, step), Number.isFinite(v[key]) ? v[key] : def, { onBegin: () => checkpoint('Adjust scene'), onChange: value => { v[key] = value; syncScene(); markDirty(); } }));
    }
    for (const [key, label] of [['water', 'Water surface'], ['shadows', 'Terrain self-shadowing'], ['grid', 'Ground grid'], ['contours', 'Elevation contours']]) {
        const row = el('label', 'scene-row'), input = el('input');
        input.type = 'checkbox';
        input.checked = renderer?.settings[key] ?? key !== 'contours';
        input.onchange = () => { checkpoint('Toggle ' + label); v[key] = input.checked; syncScene(); markDirty(); };
        row.append(el('span', '', label), input);
        body.append(row);
    }
    const biome = graph.nodes.find(n => n.type === 'biome');
    if (biome) {
        body.append(el('div', 'inspector-section-title', 'SURFACE BIOME'), parameterControl('palette', registry.biome.params.palette, biome.params.palette, { onBegin: () => checkpoint('Change biome'), onChange: value => { biome.params.palette = value; v.palette = value; markDirty({ build: true }); } }));
    }
    const reset = el('button', 'button subtle full', 'Reset camera');
    reset.onclick = () => renderer.camera.reset();
    body.append(reset);
}
function renderBuild(body) {
    body.append(el('h2', 'inspector-title', 'Build monitor'), el('p', 'inspector-intro', 'Only the dependency chain of the preview target is evaluated. Unchanged fields are reused from the cache.'));
    const label = el('div', 'inspector-section-title', 'COMPUTE BACKEND'), select = el('select', 'select-input backend-select');
    select.setAttribute('aria-label', 'Compute backend');
    for (const [value, text] of [['gpu', 'WebGPU compute'], ['cpu', 'CPU worker']]) {
        const option = el('option', '', text);
        option.value = value;
        option.disabled = value === 'gpu' && !gpuInfo;
        select.append(option);
    }
    select.value = engine?.backend.kind === 'WebGPU' ? 'gpu' : 'cpu';
    select.onchange = () => switchBackend(select.value);
    body.append(label, select, el('p', 'backend-detail', gpuInfo?.description || 'WebGPU was not available. The CPU worker evaluates the same node graph.'));
    if (lastMetrics) {
        const card = el('div', 'build-card');
        card.append(el('div', 'label', 'LAST BUILD · WALL CLOCK'));
        const value = el('div', 'value', lastMetrics.wallMs.toFixed(0));
        value.append(el('span', '', 'ms'));
        card.append(value, el('div', 'description', `${lastMetrics.resolution}² samples · ${lastMetrics.nodes.length} evaluated nodes · ${lastMetrics.cacheHits} cache hits`));
        body.append(card);
        for (const m of lastMetrics.nodes) {
            const row = el('div', 'build-node-row'), dot = el('span', 'node-dot');
            dot.style.background = categories[registry[m.type].category].color;
            row.append(dot, el('span', '', m.name), el('span', m.cached ? 'cached' : 'ms', m.cached ? 'CACHED' : `${m.ms.toFixed(1)} ms`));
            body.append(row);
        }
        body.append(el('p', 'stat-caption', 'Per-node values are host orchestration timings, not isolated GPU timestamp queries. CPU bridges are used for D8 flow routing, imported rasters and brush evaluation.'));
    }
    const buttons = el('div', 'property-actions');
    buttons.style.marginTop = '20px';
    const build = el('button', 'button', 'Rebuild'), clear = el('button', 'button', 'Clear cache');
    build.onclick = () => buildTerrain();
    clear.onclick = () => { engine.clearCache(); $('cacheStats').textContent = '0 MB cache'; buildTerrain(); };
    buttons.append(build, clear);
    body.append(buttons, el('p', 'stat-caption', 'Preview supports 64–1024 samples per side. The export builder also supports 2048. Device memory and simulation settings determine practical build cost.'));
}
async function switchBackend(kind, { rebuild = true } = {}) { if (!engine)
    return; const old = engine; requestSerial++; old.cancel(); setBusy(false); await old.dispose(); const backend = kind === 'gpu' && gpuInfo ? new GpuBackend(gpuInfo.device, { hybridBackend: new CpuBackend({ workerURL }) }) : new CpuBackend({ workerURL }); engine = new TerrainEngine(backend); engine.progress.on(progress); $('computeBadge').textContent = `${backend.kind} compute`; $('computeBadge').title = renderer.kind + ' renderer'; if (inspectorTab === 'build')
    renderInspector(); if (rebuild)
    await buildTerrain({ fallback: false }); }
function sceneToggle(key) { checkpoint('Toggle viewport ' + key); graph.project.view[key] = !renderer.settings[key]; syncScene(); markDirty(); if (inspectorTab === 'scene')
    renderInspector(); }
function commands(position = null) {
    const m = modal('Commands');
    m.dialog.classList.add('command-dialog');
    const search = el('div', 'command-search'), symbol = el('span');
    symbol.innerHTML = icon('search');
    const input = el('input');
    input.placeholder = 'Search nodes, projects, and commands…';
    input.setAttribute('aria-label', 'Search commands');
    search.append(symbol, input, el('kbd', '', 'Esc'));
    const list = el('div', 'command-results');
    m.body.append(search, list);
    const foot = el('div', 'command-footer');
    foot.innerHTML = '<span><kbd>↑</kbd> <kbd>↓</kbd> Navigate</span><span><kbd>Enter</kbd> Select</span><span><kbd>Esc</kbd> Dismiss</span>';
    m.body.append(foot);
    m.footer.remove();
    const actions = [{ label: 'Build terrain', category: 'Command', icon: 'play', action: () => buildTerrain() }, { label: 'Export terrain…', category: 'Command', icon: 'output', action: showExport }, { label: 'Save project', category: 'Command', icon: 'save', action: saveProject }, { label: 'Open project…', category: 'Command', icon: 'folder', action: () => $('projectFile').click() }, { label: 'New empty project', category: 'Command', icon: 'file', action: newProject }, { label: 'Reseed procedural nodes', category: 'Command', icon: 'refresh', action: reseed }, { label: 'Sculpt terrain', category: 'Command', icon: 'brush', action: () => enterSculpt() }, { label: 'Show final output', category: 'Command', icon: 'eye', action: finalPreview }, { label: 'Fit graph', category: 'Command', icon: 'fit', action: () => graphUI.fit() }, { label: 'Scene settings', category: 'Command', icon: 'settings', action: () => { inspectorTab = 'scene'; renderInspector(); } }, { label: 'Guide and shortcuts', category: 'Command', icon: 'help', action: showGuide }, ...Object.entries(registry).map(([type, d]) => ({ label: d.label, category: d.category, icon: d.icon, color: categories[d.category].color, action: () => addNode(type, position) }))];
    let items = [], index = 0;
    const draw = () => { items = actions.filter(a => `${a.label} ${a.category}`.toLowerCase().includes(input.value.toLowerCase())).slice(0, 45); index = Math.min(index, items.length - 1); list.replaceChildren(); items.forEach((a, i) => { const row = el('button', 'command-row' + (i === index ? ' selected' : '')); row.style.setProperty('--command-color', a.color || '#92c8b3'); const symbol = el('span'); symbol.innerHTML = icon(a.icon); row.append(symbol, el('span', 'command-label', a.label), el('span', 'command-category', a.category)); row.onclick = () => { m.close(); a.action(); }; list.append(row); }); if (!items.length)
        list.append(el('p', 'empty-state', 'No matching commands or nodes.')); };
    input.oninput = () => { index = 0; draw(); };
    input.onkeydown = e => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        index = clamp(index + (e.key === 'ArrowDown' ? 1 : -1), 0, items.length - 1);
        draw();
        list.children[index]?.scrollIntoView({ block: 'nearest' });
    } if (e.key === 'Enter' && items[index]) {
        e.preventDefault();
        const a = items[index];
        m.close();
        a.action();
    } };
    draw();
    input.focus();
}
function showGuide() { const m = modal('TerraWeave · field guide', { wide: true }); m.body.innerHTML = `<p class="intro">An original, local-first procedural terrain studio. Build a real dependency graph, simulate natural processes, inspect intermediate fields, and export your terrain to another engine.</p><div class="feature-grid"><div class="feature-card"><h4>01 / Begin with a world</h4><p>Choose a starter world, or click a generator in the library. A node added by click connects to the selected node when it has a terrain input. Drag a library node into the graph to place it unconnected.</p></div><div class="feature-card"><h4>02 / Shape the graph</h4><p>Drag from an output circle to an input circle. Inputs accept one source; reconnecting replaces it. Right-click an input or double-click a wire to disconnect. Cycles are rejected.</p></div><div class="feature-card"><h4>03 / Follow the water</h4><p>Hydraulic erosion transports water and sediment between neighboring cells. Preview Height, Flow, Wear, Deposits or Water in the Properties panel. Snow and thermal transport are separate operations.</p></div><div class="feature-card"><h4>04 / Paint without baking</h4><p>The brush tool inserts a non-destructive Sculpt node before the material node. Paint in the 2D view. Raise, lower, smooth and flatten are replayed at build resolution. Each pointer gesture is one undo step.</p></div><div class="feature-card"><h4>05 / Look through the surface</h4><p>Orbit with a drag, pan with Shift-drag or right-drag, and zoom with the wheel. Two-finger touch pans and pinches. Use 2D for maps, or inspect height, clay, normals, wireframe and contour views.</p></div><div class="feature-card"><h4>06 / Build beyond the preview</h4><p>Export can rebuild the final output at a different resolution. PNG is genuinely 16-bit grayscale. Float32 RAW and uncompressed OpenEXR preserve unclipped values. GLB includes normals, UVs and vertex colors.</p></div></div><h3>Keyboard shortcuts</h3><div class="help-shortcuts">${[['⌘/Ctrl K', 'Command palette'], ['Tab in graph', 'Add a node'], ['B', 'Build preview'], ['Space', 'Preview selected node'], ['Shift Space', 'Return to final output'], ['F', 'Reset camera'], ['Home', 'Fit graph'], ['⌘/Ctrl S', 'Save project file'], ['⌘/Ctrl O', 'Open project'], ['⌘/Ctrl Z', 'Undo'], ['⌘/Ctrl Shift Z', 'Redo'], ['⌘/Ctrl D', 'Duplicate nodes'], ['Delete', 'Delete selected nodes'], ['/', 'Search node library'], ['Escape', 'Cancel build / exit sculpt'], ['⌘/Ctrl Shift E', 'Export terrain']].map(([k, v]) => `<div><span>${v}</span><kbd>${k}</kbd></div>`).join('')}</div><h3>Precision and boundaries</h3><p>Terrain X/Z span the world extent in meters. Normalized elevation is multiplied by the project elevation range. Erosion uses closed boundaries and an artist-oriented finite-volume model; it is not a calibrated hydrology solver. Results are deterministic within a backend, not bit-identical between CPU and GPU or across resolutions.</p><p>TerraWeave uses its own project format, original kernels, and original UI. It does not load proprietary Gaea projects or reproduce Gaea's proprietary erosion algorithms. Tiled multi-region worlds, native engine bridges, arbitrary meshes, collaborative editing and multi-layer 2.7D terrain are not implemented in this release.</p>`; const close = el('button', 'button primary', 'Start creating'); close.onclick = m.close; m.footer.append(close); }
function showAbout() { const m = modal('TerraWeave · independent by design', { wide: true }); m.body.innerHTML = `<p>An original HTML, JavaScript and WebGPU terrain studio built from ten standalone ES-module packages. No server-side generation, remote assets, UI framework, or telemetry is needed at runtime.</p><div class="package-list">${['math', 'core', 'nodes', 'kernels', 'webgpu', 'engine', 'renderer', 'graph-ui', 'ui', 'io'].map(n => `<code>@terraweave/${n}</code>`).join('')}</div><h3>A real terrain pipeline</h3><p>The graph evaluator owns reference-counted raster packets. GPU-compatible nodes keep their fields in storage buffers. Erosion uses separate flux and gather passes; rendering uses vertex-pulled terrain geometry. CPU work runs in a dedicated module worker.</p><h3>Your project, your machine</h3><p>Projects autosave in IndexedDB. Save a portable JSON project file for backups and transfers. Embedded imported heightfields and brush strokes travel with the project. No project data is uploaded by the app.</p><h3>Original implementation</h3><p>Inspired by node-based terrain-authoring workflows, not affiliated with or endorsed by QuadSpinner. See the source package for the implementation, tests, architecture and capability matrix.</p>`; const b = el('button', 'button primary', 'Field guide'); b.onclick = () => { m.close(); showGuide(); }; m.footer.append(b); }
function showExport() {
    const m = modal('Export terrain'), form = el('div');
    m.body.append(el('p', 'intro', 'Build the final output and write portable assets. Export resolution is independent of the interactive preview.'), form);
    const makeSelect = (id, label, options, value) => { const row = el('div', 'form-row'), name = el('label', '', label), select = el('select', 'select-input'); name.htmlFor = id; select.id = id; for (const [v, text] of options) {
        const o = el('option', '', text);
        o.value = String(v);
        select.append(o);
    } select.value = String(value); row.append(name, select); form.append(row); return select; };
    const formats = { bundle: ['Terrain asset bundle · ZIP', 'A portable project, 16-bit height PNG, float32 height RAW, normal/albedo/splat PNG maps and simulation fields.'], png16: ['Height / map · PNG 16-bit', 'Lossless grayscale PNG. Values are clamped to 0–1 unless normalization is enabled.'], r32: ['Height / map · RAW float32', 'Unclipped IEEE 754 float32 samples, little-endian, row-major, no header.'], r16: ['Height / map · RAW uint16', 'Unsigned 16-bit samples, little-endian. Values are clamped to 0–1 unless normalized.'], exr: ['Height / map · OpenEXR float32', 'Uncompressed scanline OpenEXR with a single FLOAT channel named Y.'], normal: ['Tangent normal map · PNG', 'RGBA8 normal map: R tangent +X, G tangent +Z/image V down, B up.'], albedo: ['Surface color · PNG', 'RGBA8 surface color, approximately sRGB encoded. No viewport shadows are baked in.'], splat: ['Material weights · PNG', 'RGBA8 sand, grass, rock and snow weights. Each pixel sums to 255.'], glb: ['Terrain mesh · GLB', 'glTF 2.0 binary, +Y up, meters, normals, UV coordinates and linear vertex colors.'], obj: ['Terrain mesh · OBJ', 'Indexed terrain grid with normals and UV coordinates, in meters. No material texture is embedded.'], project: ['Portable project · JSON', 'Graph, parameters, embedded heightfield samples and non-destructive brush strokes.'], viewport: ['Viewport capture · PNG', 'The currently visible viewport, at its current display pixel resolution.'] };
    const format = makeSelect('exportFormat', 'Format', Object.entries(formats).map(([k, v]) => [k, v[0]]), 'bundle');
    const size = makeSelect('exportResolution', 'Resolution', [64, 128, 256, 512, 1024, 2048].map(n => [n, `${n} × ${n}`]), graph.project.resolution);
    const channel = makeSelect('exportChannel', 'Field', [['height', 'Height'], ...Object.keys(currentSnapshot?.maps || {}).map(k => [k, portLabels[k] || k])], 'height');
    const segments = makeSelect('exportSegments', 'Mesh grid', [32, 64, 128, 256, 512, 1024].map(n => [n, `${n} segments per side`]), 256);
    const normRow = el('label', 'scene-row'), normalize = el('input');
    normalize.type = 'checkbox';
    normalize.id = 'exportNormalize';
    normRow.append(el('span', '', 'Normalize selected field to 0–1'), normalize);
    form.append(normRow);
    const desc = el('div', 'export-description'), estimate = el('div', 'export-size'), note = el('p', 'export-note', 'A 2048² build can use hundreds of megabytes. The build monitor and cancel button remain available. Erosion is rebuilt at export resolution, not simply upscaled.');
    m.body.append(desc, estimate, note);
    const message = el('span', 'progress-message'), cancel = el('button', 'button', 'Cancel'), save = el('button', 'button primary', 'Build & export');
    save.id = 'confirmExport';
    let exporting = false;
    cancel.onclick = () => { if (exporting)
        engine.cancel(); m.close(); };
    m.footer.append(message, cancel, save);
    m.dialog.addEventListener('cancel', () => { if (exporting)
        engine.cancel(); });
    const update = () => { const f = format.value, n = Number(size.value), simple = ['project', 'viewport'].includes(f), mesh = ['glb', 'obj'].includes(f), field = ['png16', 'r16', 'r32', 'exr'].includes(f); size.parentElement.hidden = simple; channel.parentElement.hidden = !field; segments.parentElement.hidden = !mesh; normRow.hidden = !field; desc.textContent = formats[f][1]; estimate.textContent = simple ? '' : mesh ? `${Math.min(n - 1, Number(segments.value)) ** 2 * 2} triangles` : `${(n * n / 1e6).toFixed(2)} million samples · ${(n * n * 4 / 1048576).toFixed(1)} MiB per float field`; save.textContent = simple ? 'Export' : 'Build & export'; };
    format.onchange = size.onchange = segments.onchange = update;
    update();
    save.onclick = async () => {
        if (exporting)
            return;
        const f = format.value, stem = fileStem(), n = Number(size.value);
        if (f === 'project') {
            saveProject();
            m.close();
            return;
        }
        if (f === 'viewport') {
            try {
                download(await renderer.capture(), stem + '-viewport.png', 'image/png');
                m.close();
            }
            catch (e) {
                errorToast(e);
            }
            return;
        }
        if (!graph.project.output) {
            toast('Add a terrain output before exporting', { type: 'error' });
            return;
        }
        exporting = true;
        save.disabled = true;
        [format, size, channel, segments, normalize].forEach(e => e.disabled = true);
        clearTimeout(buildTimer);
        requestSerial++;
        setBusy(true);
        let built = null;
        try {
            const project = structuredClone(graph.project);
            project.resolution = n;
            built = await engine.build(project, { resolution: n, target: project.output, onProgress: p => { progress(p); message.textContent = `${p.name} · ${Math.round(p.fraction * 100)}%`; } });
            message.textContent = 'Reading terrain fields…';
            const snapshot = await engine.backend.read(built.result);
            let data = channel.value === 'height' ? snapshot.height : snapshot.maps[channel.value];
            if (!data)
                data = snapshot.height;
            const range = statistics(data);
            if (normalize.checked) {
                const source = data;
                data = new Float32Array(source.length);
                const width = range.max - range.min || 1;
                for (let i = 0; i < data.length; i++)
                    data[i] = (source[i] - range.min) / width;
            }
            message.textContent = 'Encoding file…';
            await new Promise(r => setTimeout(r, 0));
            let bytes, ext, mime = 'application/octet-stream';
            const options = { worldSize: project.worldSize, elevation: project.elevation, segments: Number(segments.value) };
            if (f === 'bundle') {
                bytes = await exportBundle(snapshot, project);
                ext = 'zip';
                mime = 'application/zip';
            }
            else if (f === 'png16') {
                bytes = await encodePNG16(data, n);
                ext = 'png';
                mime = 'image/png';
            }
            else if (f === 'r32') {
                bytes = raw32(data);
                ext = 'r32';
            }
            else if (f === 'r16') {
                bytes = raw16(data);
                ext = 'r16';
            }
            else if (f === 'exr') {
                bytes = encodeEXR(data, n);
                ext = 'exr';
            }
            else if (f === 'normal') {
                bytes = await encodePNG8(normalMap(snapshot.height, n, project.worldSize, project.elevation), n);
                ext = 'png';
                mime = 'image/png';
            }
            else if (f === 'albedo') {
                bytes = await encodePNG8(colorMap(snapshot), n);
                ext = 'png';
                mime = 'image/png';
            }
            else if (f === 'splat') {
                bytes = await encodePNG8(splatMap(snapshot.height, n, project.worldSize, project.elevation, project.view), n);
                ext = 'png';
                mime = 'image/png';
            }
            else if (f === 'glb') {
                bytes = encodeGLB(snapshot, options);
                ext = 'glb';
                mime = 'model/gltf-binary';
            }
            else if (f === 'obj') {
                bytes = encodeOBJ(snapshot, options);
                ext = 'obj';
            }
            if (!m.dialog.open)
                return;
            download(bytes, `${stem}-${['png16', 'r32', 'r16', 'exr'].includes(f) ? channel.value : f}-${n}.${ext}`, mime);
            toast('Terrain exported', { detail: `${n}² · ${(bytes.length / 1048576).toFixed(2)} MiB · ${formats[f][0]}` });
            status('Export complete');
            m.close();
        }
        catch (e) {
            if (e.name !== 'AbortError') {
                errorToast(e, 'Export failed');
                message.textContent = e.message;
            }
            else
                message.textContent = 'Cancelled';
        }
        finally {
            if (built)
                releasePacket(built.result);
            exporting = false;
            save.disabled = false;
            [format, size, channel, segments, normalize].forEach(e => e.disabled = false);
            setBusy(false);
        }
    };
}
function enterSculpt(id = null) {
    if (!renderer)
        return;
    let node = graph.node(id) || graph.nodes.find(n => n.type === 'paint');
    if (!node) {
        if (!graph.project.output) {
            toast('Start with a terrain generator', { type: 'error' });
            return;
        }
        checkpoint('Insert sculpt layer');
        const oldOutput = graph.project.output, biome = graph.nodes.find(n => n.type === 'biome'), edge = biome ? graph.edges.find(e => e.to === biome.id && e.input === 'a') : null;
        const source = graph.node(edge?.from || oldOutput);
        node = graph.add('paint', source.x + 230, source.y + 150);
        node.strokes = [];
        graph.connect(source.id, edge?.port || 'height', node.id, 'a');
        if (edge) {
            graph.connect(node.id, 'height', biome.id, 'a');
            graph.project.output = oldOutput;
        }
        else
            graph.project.output = node.id;
        graphUI.refresh();
        markDirty({ build: true, delay: 0 });
    }
    sculptNode = node.id;
    selected = node.id;
    graphUI.select(node.id);
    viewMode(true);
    preview = { id: null, port: 'height' };
    renderer.setSettings({ mode: 0 });
    $('displayMode').value = '0';
    $('brushToolbar').hidden = false;
    $('sculptTool').classList.add('active');
    $('terrainCanvas').style.cursor = 'crosshair';
    renderInspector();
    updateProjectUI();
    scheduleBuild(0);
    status('Sculpt in the 2D map · Shift temporarily lowers the terrain');
}
function exitSculpt() { sculptNode = null; strokeActive = false; strokeLast = null; $('brushToolbar').hidden = true; $('brushCursor').hidden = true; $('sculptTool').classList.remove('active'); if ($('terrainCanvas'))
    $('terrainCanvas').style.cursor = ''; }
function attachSculpt() {
    sculptListeners?.abort();
    sculptListeners = new AbortController();
    const canvas = $('terrainCanvas'), options = { signal: sculptListeners.signal };
    let flattenTarget = .3;
    const point = e => renderer.mapCoordinates(e.clientX, e.clientY), inside = p => p.x >= 0 && p.y >= 0 && p.x <= 1 && p.y <= 1;
    const cursor = e => { const p = point(e), r = canvas.getBoundingClientRect(), diameter = 2 * Number($('brushRadius').value) * Math.min(r.width, r.height) * .86; const c = $('brushCursor'); c.hidden = !sculptNode || !inside(p); c.style.width = c.style.height = diameter + 'px'; c.style.left = e.clientX - r.left + 'px'; c.style.top = e.clientY - r.top + 'px'; };
    const dab = (p, e) => { const node = graph.node(sculptNode); if (!node || !inside(p))
        return; node.strokes ??= []; if (node.strokes.length >= 10000) {
        strokeActive = false;
        toast('Brush layer reached its 10,000-dab limit', { detail: 'Add another Sculpt node to continue.' });
        return;
    } const mode = e.shiftKey ? 'lower' : $('brushMode').value, pressure = e.pointerType === 'pen' ? Math.max(.05, e.pressure) : 1; node.strokes.push({ x: p.x, y: p.y, radius: Number($('brushRadius').value), strength: Number($('brushStrength').value) * pressure * (mode === 'lower' ? -1 : 1), mode, target: flattenTarget }); };
    canvas.addEventListener('pointerdown', e => { if (!sculptNode || !renderer.settings.flat || e.button !== 0)
        return; const p = point(e); if (!inside(p))
        return; e.preventDefault(); checkpoint('Sculpt gesture'); strokeActive = true; strokeLast = p; flattenTarget = viewSnapshot ? sample(viewSnapshot.height, viewSnapshot.size, p.x * (viewSnapshot.size - 1), p.y * (viewSnapshot.size - 1)) : .3; canvas.setPointerCapture(e.pointerId); dab(p, e); markDirty({ build: true, delay: 100 }); }, options);
    canvas.addEventListener('pointermove', e => { if (!sculptNode)
        return; cursor(e); if (!strokeActive)
        return; const p = point(e), spacing = Number($('brushRadius').value) * .24, distance = Math.hypot(p.x - strokeLast.x, p.y - strokeLast.y), count = Math.min(48, Math.floor(distance / spacing)); if (count) {
        const from = strokeLast;
        for (let j = 1; j <= count; j++)
            dab({ x: from.x + (p.x - from.x) * j / count, y: from.y + (p.y - from.y) * j / count }, e);
        strokeLast = p;
        markDirty({ build: true, delay: 120 });
    } }, options);
    const end = e => { if (!strokeActive)
        return; strokeActive = false; strokeLast = null; if (canvas.hasPointerCapture(e.pointerId))
        canvas.releasePointerCapture(e.pointerId); markDirty({ build: true, delay: 0 }); renderInspector(); };
    canvas.addEventListener('pointerup', end, options);
    canvas.addEventListener('pointercancel', end, options);
    canvas.addEventListener('pointerleave', () => { $('brushCursor').hidden = true; }, options);
}
async function readProjectFile(file) { if (!file)
    return; if (file.size > 100 * 1048576)
    throw new Error('Project is larger than 100 MiB'); const next = Graph.parse(await file.text(), registry); replaceProject(next.project, { label: 'Open project' }); toast('Project opened', { detail: file.name }); }
async function readHeightFile(file) { if (!file)
    return; status('Reading heightfield…', 'busy'); const asset = await importImage(file); checkpoint('Import heightfield'); const previousOutput = graph.project.output; let node = graph.node(importTarget); const replacing = node?.type === 'import'; if (!replacing) {
    const at = graphUI.visibleCenter();
    node = graph.add('import', at.x, at.y);
} node.asset = { size: asset.size, data: Array.from(asset.data), precision: asset.precision || 32 }; node.name = file.name.replace(/\.[^.]+$/, '').slice(0, 80); selected = node.id; preview = { id: null, port: 'height' }; graph.project.output = replacing && previousOutput ? previousOutput : node.id; graphUI.refresh(); graphUI.select(node.id); changeGraph('graph'); toast('Heightfield imported', { detail: `${asset.size}² embedded samples · ${asset.precision || 32}-bit source` }); importTarget = null; }
async function captureViewport() { try {
    download(await renderer.capture(), fileStem() + '-viewport.png', 'image/png');
    toast('Viewport image saved');
}
catch (e) {
    errorToast(e);
} }
function openInspector(tab) { inspectorTab = tab; renderInspector(); $('app').classList.remove('right-hidden'); if (innerWidth < 700)
    $('app').classList.add('mobile-inspector-open'); }
function bindUI() {
    const click = (id, action) => $(id).addEventListener('click', action);
    for (const [id, action] of Object.entries({ brand: showAbout, commandButton: () => commands(), saveProject, exportButton: showExport, undo, redo, buildButton: () => buildTerrain(), cancelBuild: () => { clearTimeout(buildTimer); engine.cancel(); }, importHeight: () => { importTarget = null; $('heightFile').click(); }, view3D: () => viewMode(false), view2D: () => viewMode(true), toggleContours: () => sceneToggle('contours'), toggleWater: () => sceneToggle('water'), toggleShadows: () => sceneToggle('shadows'), toggleGrid: () => sceneToggle('grid'), sceneSettings: () => openInspector('scene'), worldSettings: () => openInspector('scene'), resetCamera: () => { viewMode(false); renderer.camera.reset(); }, topCamera: () => { viewMode(false); renderer.camera.preset('top'); }, sculptTool: () => sculptNode ? exitSculpt() : enterSculpt(), capture: captureViewport, exitSculpt, addNode: () => commands(), duplicateNode: () => graphUI.duplicateSelected(), deleteNode: () => graphUI.deleteSelected(), fitGraph: () => graphUI.fit(), graphZoom: () => graphUI.zoomAt(1), statusHelp: showGuide, toggleLibrary: () => $('app').classList.toggle('left-hidden'), mobileLibrary: () => $('app').classList.toggle('mobile-library-open'), mobileInspector: () => $('app').classList.toggle('mobile-inspector-open') }))
        click(id, action);
    click('fullscreen', async () => { try {
        if (document.fullscreenElement)
            await document.exitFullscreen();
        else
            await $('viewportPanel').requestFullscreen();
    }
    catch (e) {
        toast('Fullscreen is unavailable', { detail: e.message });
    } });
    $('projectName').addEventListener('change', () => { checkpoint('Rename project'); graph.project.name = $('projectName').value.trim() || 'Untitled terrain'; updateProjectUI(); markDirty(); });
    $('autoBuild').onchange = () => { autoBuild = $('autoBuild').checked; if (autoBuild)
        scheduleBuild(0); };
    $('resolution').onchange = () => { checkpoint('Preview resolution'); graph.project.resolution = Number($('resolution').value); updateProjectUI(); markDirty({ build: true, delay: 0 }); };
    $('displayMode').onchange = () => renderer.setSettings({ mode: Number($('displayMode').value) });
    $('nodeSearch').oninput = renderLibrary;
    for (const b of document.querySelectorAll('[data-library-tab]'))
        b.onclick = () => { libraryTab = b.dataset.libraryTab; for (const t of document.querySelectorAll('[data-library-tab]'))
            t.classList.toggle('active', t === b); renderLibrary(); };
    for (const b of document.querySelectorAll('[data-inspector-tab]'))
        b.onclick = () => { inspectorTab = b.dataset.inspectorTab; renderInspector(); };
    $('projectFile').onchange = async (e) => { try {
        await readProjectFile(e.target.files[0]);
    }
    catch (error) {
        errorToast(error, 'Cannot open project');
    }
    finally {
        e.target.value = '';
    } };
    $('heightFile').onchange = async (e) => { try {
        await readHeightFile(e.target.files[0]);
    }
    catch (error) {
        errorToast(error, 'Cannot import heightfield');
    }
    finally {
        e.target.value = '';
    } };
    click('fileMenu', () => menu($('fileMenu'), [{ label: 'New empty project', icon: 'file', action: newProject }, { label: 'Open project…', icon: 'folder', shortcut: '⌘ O', action: () => $('projectFile').click() }, { label: 'Save project', icon: 'save', shortcut: '⌘ S', action: saveProject }, { label: 'Import heightfield…', icon: 'import', action: () => { importTarget = null; $('heightFile').click(); } }, { separator: true }, { label: 'Export terrain…', icon: 'output', shortcut: '⌘ ⇧ E', action: showExport }, { label: 'Save viewport image', icon: 'camera', action: captureViewport }]));
    click('editMenu', () => menu($('editMenu'), [{ label: 'Undo', icon: 'undo', shortcut: '⌘ Z', disabled: !history.undoStack.length, action: undo }, { label: 'Redo', icon: 'redo', shortcut: '⌘ ⇧ Z', disabled: !history.redoStack.length, action: redo }, { separator: true }, { label: 'Duplicate selected', icon: 'copy', action: () => graphUI.duplicateSelected() }, { label: 'Delete selected', icon: 'trash', action: () => graphUI.deleteSelected() }, { label: 'Reseed terrain', icon: 'refresh', action: reseed }]));
    click('viewMenu', () => menu($('viewMenu'), [{ label: '3D terrain', icon: 'cube', action: () => viewMode(false) }, { label: '2D map', icon: 'map', action: () => viewMode(true) }, { label: 'Final output', icon: 'eye', action: finalPreview }, { label: 'Reset camera', icon: 'refresh', shortcut: 'F', action: () => renderer.camera.reset() }, { separator: true }, { label: 'Toggle node library', icon: 'split', action: () => $('app').classList.toggle('left-hidden') }, { label: 'Toggle inspector', icon: 'settings', action: () => $('app').classList.toggle('right-hidden') }, { label: 'Toggle graph panel', icon: 'nodes', action: () => $('app').classList.toggle('graph-hidden') }, { label: 'Fit graph', icon: 'fit', shortcut: 'Home', action: () => graphUI.fit() }]));
    click('buildMenu', () => menu($('buildMenu'), [{ label: 'Build preview', icon: 'play', shortcut: 'B', action: () => buildTerrain() }, { label: 'Build monitor', icon: 'activity', action: () => openInspector('build') }, { label: 'Clear build cache', icon: 'trash', action: () => { engine.clearCache(); buildTerrain(); } }, { label: 'Cancel build', icon: 'stop', disabled: !busy, action: () => engine.cancel() }]));
    click('helpMenu', () => menu($('helpMenu'), [{ label: 'Field guide & shortcuts', icon: 'help', action: showGuide }, { label: 'Command palette', icon: 'search', shortcut: '⌘ K', action: () => commands() }, { label: 'About TerraWeave', icon: 'logo', action: showAbout }]));
    click('graphMore', () => menu($('graphMore'), [{ label: 'Fit all nodes', icon: 'fit', action: () => graphUI.fit() }, { label: 'Add node…', icon: 'plus', action: () => commands() }, { label: 'Preview selected', icon: 'eye', action: () => previewNode(selected) }, { label: 'Show final output', icon: 'output', action: finalPreview }]));
    resizer($('graphResizer'), dy => { $('graphPanel').style.height = clamp($('graphPanel').getBoundingClientRect().height - dy, 150, $('centerColumn').clientHeight - 220) + 'px'; });
    document.addEventListener('keydown', e => {
        const editing = e.target.closest('input,textarea,select,[contenteditable=true]'), dialog = !!document.querySelector('dialog[open]'), meta = e.metaKey || e.ctrlKey, key = e.key.toLowerCase();
        if (dialog)
            return;
        if (meta && key === 'k') {
            e.preventDefault();
            commands();
            return;
        }
        if (editing)
            return;
        const handled = () => e.preventDefault();
        if (meta && key === 's') {
            handled();
            saveProject();
        }
        else if (meta && key === 'o') {
            handled();
            $('projectFile').click();
        }
        else if (meta && key === 'z') {
            handled();
            e.shiftKey ? redo() : undo();
        }
        else if (meta && key === 'y') {
            handled();
            redo();
        }
        else if (meta && key === 'd') {
            handled();
            graphUI.duplicateSelected();
        }
        else if (meta && key === 'c') {
            handled();
            clipboard = graphUI.copy();
            navigator.clipboard?.writeText(clipboard).catch(() => { });
        }
        else if (meta && key === 'v') {
            handled();
            (async () => { try {
                let text = clipboard;
                try {
                    text = await navigator.clipboard.readText();
                }
                catch { }
                if (text)
                    graphUI.paste(text);
            }
            catch (error) {
                errorToast(error, 'Cannot paste nodes');
            } })();
        }
        else if (meta && e.shiftKey && key === 'e') {
            handled();
            showExport();
        }
        else if (!meta && key === 'b') {
            handled();
            buildTerrain();
        }
        else if (!meta && key === 'f') {
            handled();
            renderer.camera.reset();
        }
        else if (key === 'home') {
            handled();
            graphUI.fit();
        }
        else if (e.code === 'Space') {
            handled();
            e.shiftKey ? finalPreview() : previewNode(selected);
        }
        else if (key === 'delete' || key === 'backspace') {
            handled();
            graphUI.deleteSelected();
        }
        else if (key === 'tab' && $('graphCanvas').contains(e.target)) {
            handled();
            commands();
        }
        else if (key === '/') {
            handled();
            $('app').classList.remove('left-hidden');
            if (innerWidth < 1020)
                $('app').classList.add('mobile-library-open');
            $('nodeSearch').focus();
        }
        else if (key === 'escape') {
            engine.cancel();
            exitSculpt();
            $('app').classList.remove('mobile-library-open', 'mobile-inspector-open');
        }
    });
}
async function boot() {
    try {
        if (!query.has('fresh')) {
            try {
                const saved = await store.get();
                if (saved) {
                    graph = new Graph(registry, saved);
                    selected = graph.node('erode') ? 'erode' : graph.project.output;
                    $('autosaveStatus').textContent = 'Restored local project';
                }
            }
            catch (e) {
                console.warn('Project restore:', e);
                toast('Could not restore the saved project', { detail: 'A starter world was opened instead. Your saved project has not been deleted.' });
            }
        }
        graph.project.view ??= {};
        if (graph.project.resolution === 2048)
            graph.project.resolution = 512;
        makeGraph();
        renderLibrary();
        updateProjectUI();
        updateHistory();
        bindUI();
        if (!query.has('cpu')) {
            try {
                gpuInfo = await createGPUDevice();
                gpuInfo.device.addEventListener('uncapturederror', e => { gpuErrors.push(e.error.message); console.error('WebGPU validation:', e.error.message); });
                renderer = await createRenderer($('terrainCanvas'), { device: gpuInfo.device });
            }
            catch (e) {
                console.warn('WebGPU unavailable:', e);
                const canvas = $('terrainCanvas'), replacement = canvas.cloneNode();
                canvas.replaceWith(replacement);
                gpuInfo = null;
            }
        }
        if (!renderer)
            renderer = await createRenderer($('terrainCanvas'));
        renderer.onFrame = info => $('rendererStats').textContent = `${info.kind} · ${(info.triangles / 1000).toFixed(0)}k tris · ${info.cpuMs.toFixed(1)} ms submit`;
        renderer.onError = e => errorToast(e, 'Renderer unavailable');
        const cpu = new CpuBackend({ workerURL });
        engine = new TerrainEngine(gpuInfo ? new GpuBackend(gpuInfo.device, { hybridBackend: cpu }) : cpu);
        $('computeBadge').textContent = `${engine.backend.kind} compute`;
        $('computeBadge').title = renderer.kind + ' renderer';
        syncScene();
        attachSculpt();
        renderInspector();
        graphUI.select(selected);
        booted = true;
        requestAnimationFrame(() => graphUI.fit());
        if (gpuInfo)
            gpuInfo.device.lost.then(async (info) => { if (info.reason === 'destroyed')
                return; gpuErrors.push('Device lost: ' + info.message); toast('GPU device lost', { type: 'error', detail: 'Reload to recover the native GPU renderer. Your project is saved locally.' }); status('GPU device lost · save your project and reload', 'error'); });
        window.terraweave = { get graph() { return graph; }, get engine() { return engine; }, get renderer() { return renderer; }, get snapshot() { return currentSnapshot; }, get metrics() { return lastMetrics; }, get busy() { return busy; }, get gpuErrors() { return gpuErrors; }, get history() { return history; }, get graphUI() { return graphUI; }, get registry() { return registry; }, build: buildTerrain, loadPreset, addNode, replaceProject, previewNode, finalPreview, enterSculpt, exitSculpt, undo, redo, showExport, readProjectFile, readHeightFile, switchBackend, select: id => { selected = id; graphUI.select(id); renderInspector(); }, setParameter: (id, key, value) => { const node = graph.node(id); if (!node)
                throw new Error('Missing node'); const next = new Graph(registry, structuredClone(graph.project)); next.node(id).params[key] = value; next.validate(); checkpoint('Change parameter'); node.params[key] = value; renderInspector(); markDirty({ build: true, delay: 0 }); } };
        await buildTerrain();
        renderPresets().catch(e => console.warn('Preset thumbnails:', e));
    }
    catch (e) {
        console.error(e);
        $('loadingDetail').textContent = e.message;
        $('loadingSplash').querySelector('strong').textContent = 'The terrain studio could not start';
        $('loadingSplash').querySelector('.loading-line').hidden = true;
        status(e.message, 'error');
        window.__terraweaveFatal = e.message;
    }
}
boot();
