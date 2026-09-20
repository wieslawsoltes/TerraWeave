import { Graph } from '@terraweave/core';
import { registry, categories, inputLabels, portLabels } from '@terraweave/nodes';
import { el, icon, iconButton, terrainThumbnail } from '@terraweave/ui';
const SVG = 'http://www.w3.org/2000/svg';
/** Editable HTML/SVG graph surface. The graph model and the view are intentionally independent. */
export class GraphEditor {
    constructor(root, graph, callbacks = {}) {
        this.root = root;
        this.graph = graph;
        this.callbacks = callbacks;
        this.view = { x: 20, y: 20, zoom: 1 };
        this.selected = new Set();
        this.elements = new Map();
        this.thumbnails = new Map();
        this.root.tabIndex = 0;
        this.root.classList.add('graph-viewport');
        this.world = el('div', 'graph-world');
        this.svg = document.createElementNS(SVG, 'svg');
        this.svg.classList.add('graph-wires');
        this.svg.setAttribute('width', '1');
        this.svg.setAttribute('height', '1');
        this.world.append(this.svg);
        this.root.append(this.world);
        this.minimap = el('canvas', 'graph-minimap');
        this.minimap.width = 180;
        this.minimap.height = 88;
        this.minimap.title = 'Click to navigate the graph';
        this.root.append(this.minimap);
        this.drag = null;
        this.wire = null;
        this.abort = new AbortController();
        const opts = { signal: this.abort.signal };
        this.root.addEventListener('pointerdown', e => this.pointerDown(e), opts);
        this.root.addEventListener('pointermove', e => this.pointerMove(e), opts);
        this.root.addEventListener('pointerup', e => this.pointerUp(e), opts);
        this.root.addEventListener('pointercancel', e => this.pointerUp(e, true), opts);
        this.root.addEventListener('wheel', e => { e.preventDefault(); const r = this.root.getBoundingClientRect(); if (e.shiftKey) {
            this.view.x -= e.deltaY;
            this.applyView();
        }
        else
            this.zoomAt(this.view.zoom * Math.exp(-e.deltaY * .0014), e.clientX - r.left, e.clientY - r.top); }, { ...opts, passive: false });
        this.root.addEventListener('dblclick', e => { if (e.target.closest('.terrain-node') || e.target === this.minimap)
            return; this.callbacks.onAddMenu?.(this.toWorld(e.clientX, e.clientY)); }, opts);
        this.root.addEventListener('contextmenu', e => { e.preventDefault(); const port = e.target.closest('.port-button'); if (port?.dataset.direction === 'in') {
            this.callbacks.onBeforeChange?.('Disconnect input');
            this.graph.disconnect(port.dataset.node, port.dataset.port);
            this.refresh();
            this.callbacks.onChange?.('graph');
        }
        else
            this.callbacks.onContextMenu?.(e); }, opts);
        this.root.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('application/x-terraweave-node'))
            e.preventDefault(); }, opts);
        this.root.addEventListener('drop', e => { const type = e.dataTransfer.getData('application/x-terraweave-node'); if (!registry[type])
            return; e.preventDefault(); this.callbacks.onAdd?.(type, this.toWorld(e.clientX, e.clientY)); }, opts);
        this.minimap.addEventListener('pointerdown', e => { e.stopPropagation(); const b = this.mapBounds; if (!b)
            return; const r = this.minimap.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width * b.width + b.x, y = (e.clientY - r.top) / r.height * b.height + b.y; this.view.x = this.root.clientWidth / 2 - x * this.view.zoom; this.view.y = this.root.clientHeight / 2 - y * this.view.zoom; this.applyView(); }, opts);
        this.resizeObserver = new ResizeObserver(() => this.drawMinimap());
        this.resizeObserver.observe(root);
        this.refresh();
    }
    setGraph(graph) { this.graph = graph; this.selected = new Set([...this.selected].filter(id => graph.node(id))); this.refresh(); }
    get primary() { return [...this.selected].at(-1) || null; }
    select(id, add = false) { if (!add)
        this.selected.clear(); if (id) {
        if (add && this.selected.has(id))
            this.selected.delete(id);
        else
            this.selected.add(id);
    } this.selectionClasses(); this.callbacks.onSelect?.(this.primary); }
    selectionClasses() { for (const [id, e] of this.elements)
        e.classList.toggle('selected', this.selected.has(id)); }
    refresh() {
        for (const id of this.thumbnails.keys())
            if (!this.graph.node(id))
                this.thumbnails.delete(id);
        this.elements.clear();
        for (const e of this.world.querySelectorAll('.terrain-node'))
            e.remove();
        for (const node of this.graph.nodes) {
            const d = registry[node.type], card = el('article', 'terrain-node');
            card.dataset.node = node.id;
            card.style.left = node.x + 'px';
            card.style.top = node.y + 'px';
            card.style.setProperty('--node-color', categories[d.category].color);
            card.classList.toggle('bypassed', node.enabled === false);
            card.classList.toggle('is-output', this.graph.project.output === node.id);
            const head = el('div', 'node-header'), symbol = el('span', 'node-symbol');
            symbol.innerHTML = icon(d.icon, 17);
            head.append(symbol, el('span', 'node-name', node.name), iconButton('eye', 'Preview ' + node.name, e => { e.stopPropagation(); this.callbacks.onPreview?.(node.id); }, 'node-eye'));
            card.append(head);
            const thumb = el('div', 'node-preview');
            let canvas = this.thumbnails.get(node.id);
            if (!canvas) {
                canvas = el('canvas');
                canvas.width = 150;
                canvas.height = 58;
                this.thumbnails.set(node.id, canvas);
            }
            thumb.append(canvas);
            const label = el('span', 'node-preview-label', d.category.toUpperCase());
            thumb.append(label);
            card.append(thumb);
            const ports = el('div', 'node-ports'), count = Math.max(d.inputs.length, d.outputs.length);
            for (let i = 0; i < count; i++) {
                const row = el('div', 'port-row');
                for (const dir of ['in', 'out']) {
                    const name = (dir === 'in' ? d.inputs : d.outputs)[i];
                    if (!name) {
                        row.append(el('span', 'port-spacer'));
                        continue;
                    }
                    const b = el('button', 'port-button ' + dir);
                    b.type = 'button';
                    b.dataset.node = node.id;
                    b.dataset.port = name;
                    b.dataset.direction = dir;
                    b.setAttribute('aria-label', `${node.name} ${dir === 'in' ? 'input' : 'output'} ${dir === 'in' ? inputLabels[name] : portLabels[name]}`);
                    const dot = el('i', 'port-dot'), text = el('span', 'port-label', dir === 'in' ? inputLabels[name] : portLabels[name]);
                    if (dir === 'in')
                        b.append(dot, text);
                    else
                        b.append(text, dot);
                    row.append(b);
                }
                ports.append(row);
            }
            card.append(ports);
            const foot = el('div', 'node-footer');
            foot.append(el('span', 'node-state', '●'), el('span', 'node-timing', 'Not built'));
            if (this.graph.project.output === node.id)
                foot.append(el('span', 'node-output-tag', 'OUTPUT'));
            card.append(foot);
            this.world.append(card);
            this.elements.set(node.id, card);
        }
        this.selectionClasses();
        this.applyView();
        requestAnimationFrame(() => this.drawWires());
    }
    toWorld(clientX, clientY) { const r = this.root.getBoundingClientRect(); return { x: (clientX - r.left - this.view.x) / this.view.zoom, y: (clientY - r.top - this.view.y) / this.view.zoom }; }
    visibleCenter() { return { x: (this.root.clientWidth / 2 - this.view.x) / this.view.zoom - 88, y: (this.root.clientHeight / 2 - this.view.y) / this.view.zoom - 60 }; }
    portPoint(id, port, direction) { const card = this.elements.get(id), button = card?.querySelector(`[data-direction="${direction}"][data-port="${port}"]`), dot = button?.querySelector('.port-dot'); if (!dot)
        return { x: 0, y: 0 }; const r = dot.getBoundingClientRect(); return this.toWorld(r.left + r.width / 2, r.top + r.height / 2); }
    path(a, b) { const dx = Math.max(45, Math.abs(b.x - a.x) * .45); return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`; }
    drawWires() { this.svg.replaceChildren(); for (const edge of this.graph.edges) {
        const a = this.portPoint(edge.from, edge.port, 'out'), b = this.portPoint(edge.to, edge.input, 'in'), path = document.createElementNS(SVG, 'path');
        path.setAttribute('d', this.path(a, b));
        path.setAttribute('class', 'graph-wire');
        path.style.stroke = categories[registry[this.graph.node(edge.from).type].category].color;
        path.addEventListener('dblclick', e => { e.stopPropagation(); this.callbacks.onBeforeChange?.('Disconnect'); this.graph.disconnect(edge.to, edge.input); this.refresh(); this.callbacks.onChange?.('graph'); });
        this.svg.append(path);
    } if (this.wire) {
        const origin = this.portPoint(this.wire.node, this.wire.port, this.wire.direction), target = this.wire.pointer || origin, p = document.createElementNS(SVG, 'path');
        p.setAttribute('class', 'graph-wire pending');
        p.setAttribute('d', this.wire.direction === 'out' ? this.path(origin, target) : this.path(target, origin));
        this.svg.append(p);
    } this.drawMinimap(); }
    applyView() { this.world.style.transform = `translate(${this.view.x}px,${this.view.y}px) scale(${this.view.zoom})`; this.root.style.backgroundSize = `${24 * this.view.zoom}px ${24 * this.view.zoom}px`; this.root.style.backgroundPosition = `${this.view.x}px ${this.view.y}px`; this.callbacks.onView?.(this.view); this.drawMinimap(); }
    zoomAt(zoom, x = this.root.clientWidth / 2, y = this.root.clientHeight / 2) { const z = Math.max(.22, Math.min(2, zoom)), wx = (x - this.view.x) / this.view.zoom, wy = (y - this.view.y) / this.view.zoom; this.view.x = x - wx * z; this.view.y = y - wy * z; this.view.zoom = z; this.applyView(); }
    fit() { if (!this.graph.nodes.length)
        return; let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity; for (const n of this.graph.nodes) {
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x + 178);
        maxY = Math.max(maxY, n.y + (this.elements.get(n.id)?.offsetHeight || 170));
    } const w = this.root.clientWidth - 58, h = this.root.clientHeight - 42; this.view.zoom = Math.min(1.1, Math.max(.22, Math.min(w / (maxX - minX), h / (maxY - minY)))); this.view.x = (this.root.clientWidth - (maxX - minX) * this.view.zoom) / 2 - minX * this.view.zoom; this.view.y = (this.root.clientHeight - (maxY - minY) * this.view.zoom) / 2 - minY * this.view.zoom; this.applyView(); this.drawWires(); }
    pointerDown(e) {
        if (e.button === 2)
            return;
        if (e.target.closest('.node-eye') || e.target === this.minimap)
            return;
        this.root.focus();
        const port = e.target.closest('.port-button');
        if (port) {
            e.preventDefault();
            this.wire = { node: port.dataset.node, port: port.dataset.port, direction: port.dataset.direction, pointer: this.toWorld(e.clientX, e.clientY) };
            this.root.setPointerCapture(e.pointerId);
            this.drawWires();
            return;
        }
        const card = e.target.closest('.terrain-node');
        if (card) {
            const id = card.dataset.node;
            if (!this.selected.has(id) || e.shiftKey)
                this.select(id, e.shiftKey);
            if (e.target.closest('.node-header')) {
                const p = this.toWorld(e.clientX, e.clientY);
                this.drag = { kind: 'nodes', x: p.x, y: p.y, started: false, positions: [...this.selected].map(id => { const n = this.graph.node(id); return { id, x: n.x, y: n.y }; }) };
                this.root.setPointerCapture(e.pointerId);
            }
        }
        else if (!e.target.closest('button')) {
            this.drag = { kind: 'pan', x: e.clientX, y: e.clientY, vx: this.view.x, vy: this.view.y };
            this.root.setPointerCapture(e.pointerId);
            this.root.classList.add('panning');
        }
    }
    pointerMove(e) { if (this.wire) {
        this.wire.pointer = this.toWorld(e.clientX, e.clientY);
        this.drawWires();
        return;
    } if (!this.drag)
        return; const d = this.drag; if (d.kind === 'pan') {
        this.view.x = d.vx + e.clientX - d.x;
        this.view.y = d.vy + e.clientY - d.y;
        this.applyView();
    }
    else {
        const p = this.toWorld(e.clientX, e.clientY), dx = p.x - d.x, dy = p.y - d.y;
        if (!d.started && Math.hypot(dx, dy) > 2) {
            this.callbacks.onBeforeChange?.('Move nodes');
            d.started = true;
        }
        if (d.started) {
            for (const pos of d.positions) {
                const n = this.graph.node(pos.id);
                n.x = Math.round(pos.x + dx);
                n.y = Math.round(pos.y + dy);
                const card = this.elements.get(n.id);
                card.style.left = n.x + 'px';
                card.style.top = n.y + 'px';
            }
            this.drawWires();
        }
    } }
    pointerUp(e, cancelled = false) {
        if (this.wire && !cancelled) {
            const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('.port-button'), wire = this.wire;
            if (target && target.dataset.direction !== wire.direction) {
                try {
                    this.callbacks.onBeforeChange?.('Connect nodes');
                    if (wire.direction === 'out')
                        this.graph.connect(wire.node, wire.port, target.dataset.node, target.dataset.port);
                    else
                        this.graph.connect(target.dataset.node, target.dataset.port, wire.node, wire.port);
                    this.callbacks.onChange?.('graph');
                }
                catch (error) {
                    this.callbacks.onError?.(error);
                }
            }
        }
        if (this.drag?.started)
            this.callbacks.onChange?.('layout');
        this.wire = null;
        this.drag = null;
        this.root.classList.remove('panning');
        if (this.root.hasPointerCapture(e.pointerId))
            this.root.releasePointerCapture(e.pointerId);
        this.drawWires();
    }
    setStatus(id, status, ms = null) { const e = this.elements.get(id); if (!e)
        return; e.dataset.status = status; const label = e.querySelector('.node-timing'); label.textContent = status === 'building' ? 'Building…' : status === 'cached' ? 'Cached' : ms !== null ? `${ms < 1 ? '<1' : ms.toFixed(ms < 100 ? 1 : 0)} ms` : status === 'done' ? 'Built' : 'Not built'; }
    setThumbnail(id, data, n, options = {}) { const canvas = this.thumbnails.get(id); if (canvas)
        terrainThumbnail(canvas, data, n, options); }
    drawMinimap() { if (!this.minimap || !this.graph.nodes.length)
        return; const ctx = this.minimap.getContext('2d'), w = this.minimap.width, h = this.minimap.height, nodes = this.graph.nodes; let minX = Math.min(...nodes.map(n => n.x)) - 60, minY = Math.min(...nodes.map(n => n.y)) - 40, maxX = Math.max(...nodes.map(n => n.x + 178)) + 60, maxY = Math.max(...nodes.map(n => n.y + (this.elements.get(n.id)?.offsetHeight || 170))) + 40; const scale = Math.min(w / (maxX - minX), h / (maxY - minY)); const ww = w / scale, hh = h / scale; minX -= (ww - (maxX - minX)) / 2; minY -= (hh - (maxY - minY)) / 2; this.mapBounds = { x: minX, y: minY, width: ww, height: hh }; ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#11171b'; ctx.fillRect(0, 0, w, h); for (const n of nodes) {
        ctx.fillStyle = this.selected.has(n.id) ? '#b1e7d4' : categories[registry[n.type].category].color;
        ctx.globalAlpha = .6;
        ctx.fillRect((n.x - minX) * scale, (n.y - minY) * scale, 178 * scale, Math.max(8, (this.elements.get(n.id)?.offsetHeight || 170) * scale));
    } ctx.globalAlpha = 1; ctx.strokeStyle = '#80bba7'; ctx.lineWidth = 1; ctx.strokeRect((-this.view.x / this.view.zoom - minX) * scale, (-this.view.y / this.view.zoom - minY) * scale, this.root.clientWidth / this.view.zoom * scale, this.root.clientHeight / this.view.zoom * scale); }
    deleteSelected() { if (!this.selected.size)
        return; this.callbacks.onBeforeChange?.('Delete nodes'); for (const id of this.selected)
        this.graph.remove(id); this.selected.clear(); this.refresh(); this.callbacks.onSelect?.(null); this.callbacks.onChange?.('graph'); }
    duplicateSelected() { if (!this.selected.size)
        return; this.callbacks.onBeforeChange?.('Duplicate nodes'); const map = new Map(), edges = this.graph.edges.map(e => ({ ...e })); for (const id of this.selected) {
        const old = this.graph.node(id), n = this.graph.add(old.type, old.x + 40, old.y + 40, structuredClone(old.params));
        n.name = old.name + ' copy';
        n.enabled = old.enabled;
        if (old.asset)
            n.asset = structuredClone(old.asset);
        if (old.strokes)
            n.strokes = structuredClone(old.strokes);
        map.set(id, n.id);
    } for (const e of edges)
        if (map.has(e.to))
            this.graph.connect(map.get(e.from) || e.from, e.port, map.get(e.to), e.input); this.selected = new Set(map.values()); this.refresh(); this.callbacks.onSelect?.(this.primary); this.callbacks.onChange?.('graph'); }
    copy() { const ids = this.selected; return JSON.stringify({ format: 'terraweave-nodes', nodes: this.graph.nodes.filter(n => ids.has(n.id)), edges: this.graph.edges.filter(e => ids.has(e.to)) }); }
    paste(text) {
        if (text.length > 64 * 1048576)
            throw new Error('Clipboard payload exceeds 64 MiB');
        const source = JSON.parse(text);
        if (source?.format !== 'terraweave-nodes' || !Array.isArray(source.nodes) || !source.nodes.length || source.nodes.length > 128 || !Array.isArray(source.edges))
            throw new Error('Clipboard does not contain TerraWeave nodes');
        const next = new Graph(registry, structuredClone(this.graph.project)), map = new Map(), center = this.visibleCenter(), minX = Math.min(...source.nodes.map(n => Number.isFinite(n.x) ? n.x : 0)), minY = Math.min(...source.nodes.map(n => Number.isFinite(n.y) ? n.y : 0));
        for (const old of source.nodes) {
            if (typeof old.id !== 'string' || map.has(old.id) || !registry[old.type])
                throw new Error('Invalid pasted node');
            const node = next.add(old.type, (old.x || 0) - minX + center.x, (old.y || 0) - minY + center.y, structuredClone(old.params));
            node.name = old.name;
            node.asset = structuredClone(old.asset);
            node.strokes = structuredClone(old.strokes);
            node.enabled = old.enabled;
            map.set(old.id, node.id);
        }
        for (const e of source.edges) {
            const from = map.get(e.from) || e.from, to = map.get(e.to);
            if (next.node(from) && to)
                next.connect(from, e.port, to, e.input);
        }
        next.validate();
        this.callbacks.onBeforeChange?.('Paste nodes');
        this.graph.project = next.project;
        this.selected = new Set(map.values());
        this.refresh();
        this.callbacks.onSelect?.(this.primary);
        this.callbacks.onChange?.('graph');
    }
    dispose() { this.abort.abort(); this.resizeObserver.disconnect(); this.root.replaceChildren(); }
}
