/** Backend-agnostic, reference-counted raster. Packet fields own exactly one reference. */
export class Raster {
    constructor(size, { data = null, buffer = null, channels = 1, device = null } = {}) { this.size = size; this.channels = channels; this.data = data; this.buffer = buffer; this.device = device; this.refs = 1; this.disposed = false; if (data && data.length !== size * size * channels)
        throw new Error('Raster dimensions do not match data'); }
    get byteLength() { return this.size * this.size * this.channels * 4; }
    retain() { if (this.disposed)
        throw new Error('Raster already released'); this.refs++; return this; }
    release() { if (this.disposed)
        return; if (--this.refs === 0) {
        this.disposed = true;
        this.buffer?.destroy();
        this.buffer = null;
        this.data = null;
    } }
}
export function releasePacket(p) { if (!p)
    return; p.height.release(); for (const f of Object.values(p.maps || {}))
    f.release(); p.color?.release(); }
export function retainPacket(p) { return { size: p.size, height: p.height.retain(), maps: Object.fromEntries(Object.entries(p.maps || {}).map(([k, v]) => [k, v.retain()])), color: p.color?.retain() || null }; }
export function packet(height, maps = {}, color = null) { return { size: height.size, height, maps, color }; }
export function selectPort(p, port = 'height') { if (port === 'height' || port === 'color')
    return p; const map = p.maps[port]; if (!map)
    throw new Error(`Output port '${port}' has no data`); return packet(map); }
export function field(data, n) { return new Raster(n, { data }); }
export function stableStringify(value) { if (ArrayBuffer.isView(value))
    return JSON.stringify(Array.from(value)); if (value === null || typeof value !== 'object')
    return JSON.stringify(value); if (Array.isArray(value))
    return '[' + value.map(stableStringify).join(',') + ']'; return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}'; }
export class Signal {
    #listeners = new Set();
    on(fn) { this.#listeners.add(fn); return () => this.#listeners.delete(fn); }
    emit(...args) { for (const fn of this.#listeners)
        fn(...args); }
    clear() { this.#listeners.clear(); }
}
export class Graph {
    constructor(registry, project = null) { this.registry = registry; this.changed = new Signal(); this.project = project || { format: 'terraweave', version: 1, name: 'Untitled terrain', resolution: 256, worldSize: 4000, elevation: 1800, nodes: [], edges: [], output: null, view: {} }; this.validate(); }
    get nodes() { return this.project.nodes; }
    get edges() { return this.project.edges; }
    node(id) { return this.nodes.find(n => n.id === id); }
    definition(type) { const d = this.registry[type]; if (!d)
        throw new Error(`Unknown node: ${type}`); return d; }
    add(type, x = 0, y = 0, params = {}) { const d = this.definition(type), id = globalThis.crypto?.randomUUID?.() || `n${Date.now()}-${Math.random()}`; const defaults = Object.fromEntries(Object.entries(d.params).map(([k, v]) => [k, v.default])); const n = { id, type, name: d.label, x, y, params: { ...defaults, ...params }, enabled: true }; this.nodes.push(n); this.project.output = id; this.changed.emit('add', id); return n; }
    connect(from, port, to, input) { if (from === to)
        throw new Error('A node cannot connect to itself'); const src = this.node(from), dst = this.node(to); if (!src || !dst)
        throw new Error('Connection endpoint not found'); if (!this.definition(src.type).outputs.includes(port))
        throw new Error('Unknown output port'); if (!this.definition(dst.type).inputs.includes(input))
        throw new Error('Unknown input port'); const old = this.project.edges; this.project.edges = old.filter(e => e.to !== to || e.input !== input).concat({ from, port, to, input }); try {
        this.topological();
    }
    catch (e) {
        this.project.edges = old;
        throw e;
    } this.changed.emit('connect', to); }
    disconnect(to, input) { this.project.edges = this.edges.filter(e => e.to !== to || e.input !== input); this.changed.emit('disconnect', to); }
    remove(id) { this.project.nodes = this.nodes.filter(n => n.id !== id); this.project.edges = this.edges.filter(e => e.from !== id && e.to !== id); if (this.project.output === id)
        this.project.output = this.nodes.at(-1)?.id || null; this.changed.emit('remove', id); }
    topological(target = null) { const result = [], state = new Map(), needed = target ? [target] : this.nodes.map(n => n.id); const visit = id => { if (state.get(id) === 1)
        throw new Error('Connection would create a cycle'); if (state.get(id) === 2)
        return; if (!this.node(id))
        throw new Error('Dangling node reference'); state.set(id, 1); for (const e of this.edges)
        if (e.to === id)
            visit(e.from); state.set(id, 2); result.push(id); }; needed.forEach(visit); return result; }
    validate() {
        const p = this.project;
        p.name = String(p.name || 'Untitled terrain').slice(0, 100);
        if (!p.view || typeof p.view !== 'object' || Array.isArray(p.view))
            p.view = {};
        if (p.format !== 'terraweave' || p.version !== 1)
            throw new Error('Unsupported TerraWeave project format');
        if (!Array.isArray(p.nodes) || !Array.isArray(p.edges) || p.nodes.length > 512 || p.edges.length > 2048)
            throw new Error('Invalid or oversized graph');
        const ids = new Set();
        for (const n of p.nodes) {
            if (typeof n.id !== 'string' || ids.has(n.id))
                throw new Error('Duplicate or invalid node identity');
            ids.add(n.id);
            const d = this.definition(n.type);
            if (!n.params || typeof n.params !== 'object')
                throw new Error('Missing parameters');
            for (const [key, v] of Object.entries(d.params)) {
                let x = n.params[key] ?? v.default;
                if (v.kind === 'select') {
                    if (!v.options.some(o => (typeof o === 'object' ? o.value : o) === x))
                        throw new Error(`Invalid ${key}`);
                }
                else if (v.kind === 'boolean') {
                    if (typeof x !== 'boolean')
                        throw new Error(`Invalid ${key}`);
                }
                else {
                    if (typeof x !== 'number' || !Number.isFinite(x) || x < v.min || x > v.max || (v.step === 1 && !Number.isInteger(x)))
                        throw new Error(`Parameter ${key} outside allowed range`);
                }
                n.params[key] = x;
            }
            n.x = Number.isFinite(n.x) ? n.x : 0;
            n.y = Number.isFinite(n.y) ? n.y : 0;
            n.enabled = n.enabled !== false;
            n.name = String(n.name || d.label).slice(0, 100);
            if (n.asset && (!Number.isInteger(n.asset.size) || n.asset.size < 2 || n.asset.size > 2048 || !Array.isArray(n.asset.data) || n.asset.data.length !== n.asset.size * n.asset.size || n.asset.data.some(v => typeof v !== 'number' || !Number.isFinite(v))))
                throw new Error('Invalid embedded heightfield');
            if (n.strokes && (!Array.isArray(n.strokes) || n.strokes.length > 10000 || n.strokes.some(s => !['x', 'y', 'radius', 'strength'].every(k => Number.isFinite(s[k])) || s.radius <= 0 || s.radius > 1 || Math.abs(s.strength) > 1)))
                throw new Error('Invalid brush data');
        }
        const inputs = new Set();
        for (const e of p.edges) {
            const a = this.node(e.from), b = this.node(e.to);
            if (!a || !b || !this.definition(a.type).outputs.includes(e.port) || !this.definition(b.type).inputs.includes(e.input))
                throw new Error('Invalid graph connection');
            const key = e.to + ':' + e.input;
            if (inputs.has(key))
                throw new Error('Multiple sources for an input');
            inputs.add(key);
        }
        if (p.output && !ids.has(p.output))
            throw new Error('Missing output node');
        if (![64, 128, 256, 512, 1024, 2048].includes(p.resolution))
            throw new Error('Unsupported resolution');
        if (!Number.isFinite(p.worldSize) || p.worldSize < 1 || p.worldSize > 1e7 || !Number.isFinite(p.elevation) || p.elevation < 1 || p.elevation > 1e6)
            throw new Error('Invalid world dimensions');
        this.topological();
        return true;
    }
    serialize() { return JSON.stringify(this.project, null, 2); }
    static parse(text, registry) { if (text.length > 100 * 1024 * 1024)
        throw new Error('Project exceeds 100 MiB'); const value = JSON.parse(text); if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('Invalid project document'); return new Graph(registry, value); }
}
/** Snapshot transactions coalesce pointer gestures into one undo record. */
export class History {
    constructor(limit = 80, { maxBytes = 64 * 1048576 } = {}) { this.limit = limit; this.maxBytes = maxBytes; this.undoStack = []; this.redoStack = []; }
    checkpoint(project, label = 'Edit') { this.undoStack.push({ text: JSON.stringify(project), label }); while (this.undoStack.length > 1 && (this.undoStack.length > this.limit || this.undoStack.reduce((sum, s) => sum + s.text.length * 2, 0) > this.maxBytes))
        this.undoStack.shift(); this.redoStack = []; }
    undo(project) { const s = this.undoStack.pop(); if (!s)
        return null; this.redoStack.push({ text: JSON.stringify(project), label: s.label }); return JSON.parse(s.text); }
    redo(project) { const s = this.redoStack.pop(); if (!s)
        return null; this.undoStack.push({ text: JSON.stringify(project), label: s.label }); return JSON.parse(s.text); }
    clear() { this.undoStack = []; this.redoStack = []; }
}
export class BuildCancelled extends Error {
    constructor() { super('Build cancelled'); this.name = 'AbortError'; }
}
export function throwIfAborted(signal) { if (signal?.aborted)
    throw new BuildCancelled(); }
