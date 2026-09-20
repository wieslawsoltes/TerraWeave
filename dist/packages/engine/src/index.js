import { Graph, Signal, retainPacket, releasePacket, selectPort, stableStringify, throwIfAborted } from '../../core/src/index.js';
import { registry } from '../../nodes/src/index.js';
const now = () => globalThis.performance?.now() || Date.now();
async function digest(text) { if (globalThis.crypto?.subtle) {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, '0')).join('');
} let a = 2166136261, b = 0x9e3779b9; for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 16777619);
    b = Math.imul(b ^ text.charCodeAt(i), 2246822519);
} return `${a >>> 0}:${b >>> 0}:${text.length}`; }
/** The cache owns packets; build results are retained and must be released by callers. */
export class TerrainEngine {
    constructor(backend, { cacheBytes = 256 * 1024 * 1024, maxNodes = 512 } = {}) { this.backend = backend; this.cacheBytes = cacheBytes; this.maxNodes = maxNodes; this.cache = new Map(); this.nodeResults = new Map(); this.progress = new Signal(); this.controller = null; this.tail = Promise.resolve(); this.serial = 0; this.lastMetrics = null; }
    cancel() { this.controller?.abort(); }
    build(project, { target = null, resolution = null, onProgress = null } = {}) {
        this.cancel();
        const controller = new AbortController();
        this.controller = controller;
        const serial = ++this.serial;
        const snapshot = structuredClone(project instanceof Graph ? project.project : project);
        if (resolution)
            snapshot.resolution = resolution;
        const job = () => this.#evaluate(snapshot, target || snapshot.output, controller.signal, serial, onProgress);
        const promise = this.tail.then(job, job);
        this.tail = promise.catch(() => { });
        return promise;
    }
    async #evaluate(project, target, signal, serial, onProgress) {
        throwIfAborted(signal);
        const graph = new Graph(registry, project);
        if (!target)
            throw new Error('Add a terrain generator to begin.');
        const order = graph.topological(target), n = project.resolution, locals = new Map(), signatures = new Map(), metrics = { resolution: n, totalMs: 0, nodes: [], cacheHits: 0, backend: this.backend.kind };
        const started = now();
        if (order.length > this.maxNodes)
            throw new Error(`Graph exceeds ${this.maxNodes} nodes`);
        const emit = p => { this.progress.emit(p); onProgress?.(p); };
        try {
            for (let index = 0; index < order.length; index++) {
                throwIfAborted(signal);
                const id = order[index], node = graph.node(id), d = registry[node.type];
                const inputs = {}, parents = [];
                for (const e of graph.edges.filter(e => e.to === id)) {
                    inputs[e.input] = selectPort(locals.get(e.from), e.port);
                    parents.push([e.input, e.port, signatures.get(e.from)]);
                }
                parents.sort((a, b) => a[0].localeCompare(b[0]));
                if (d.inputs.includes('a') && !inputs.a && !['paint', 'edge', 'output'].includes(node.type))
                    throw new Error(`${node.name}: connect a terrain to the Terrain input.`);
                const key = await digest(stableStringify({ type: node.type, enabled: node.enabled, params: node.params, asset: node.asset || null, strokes: node.strokes || null, n, worldSize: project.worldSize, elevation: project.elevation, parents }));
                signatures.set(id, key);
                throwIfAborted(signal);
                const start = now();
                let result, hit = false;
                if (this.cache.has(key)) {
                    const entry = this.cache.get(key);
                    result = entry.result;
                    this.cache.delete(key);
                    this.cache.set(key, entry);
                    metrics.cacheHits++;
                    hit = true;
                }
                else {
                    emit({ serial, node: id, name: node.name, index, total: order.length, fraction: index / order.length, status: 'building' });
                    result = await this.backend.run(node, inputs, n, { worldSize: project.worldSize, elevation: project.elevation, signal, onStep: f => emit({ serial, node: id, name: node.name, index, total: order.length, fraction: (index + f) / order.length, status: 'building' }) });
                    if (signal.aborted) {
                        releasePacket(result);
                        throwIfAborted(signal);
                    }
                    this.cache.set(key, { result, node: id, key });
                }
                locals.set(id, retainPacket(result));
                this.nodeResults.set(id, key);
                metrics.nodes.push({ id, type: node.type, name: node.name, ms: now() - start, cached: hit, backend: this.backend.kind === 'WebGPU' && d.op >= 103 ? 'CPU bridge' : this.backend.kind });
                this.#prune();
                emit({ serial, node: id, name: node.name, index: index + 1, total: order.length, fraction: (index + 1) / order.length, status: hit ? 'cached' : 'done' });
            }
            throwIfAborted(signal);
            metrics.totalMs = now() - started;
            metrics.cacheBytes = this.memoryUsage();
            this.lastMetrics = metrics;
            return { result: retainPacket(locals.get(target)), metrics, target, serial };
        }
        finally {
            for (const p of locals.values())
                releasePacket(p);
        }
    }
    getNodeResult(id) { const key = this.nodeResults.get(id); return this.cache.get(key)?.result || null; }
    memoryUsage() { const fields = new Set(); for (const { result } of this.cache.values()) {
        fields.add(result.height);
        if (result.color)
            fields.add(result.color);
        for (const m of Object.values(result.maps))
            fields.add(m);
    } let total = 0; for (const r of fields)
        total += r.byteLength; return total; }
    #prune() { while (this.cache.size > 1 && (this.cache.size > 128 || this.memoryUsage() > this.cacheBytes)) {
        const key = this.cache.keys().next().value;
        releasePacket(this.cache.get(key).result);
        this.cache.delete(key);
        for (const [id, value] of this.nodeResults)
            if (value === key)
                this.nodeResults.delete(id);
    } }
    clearCache() { for (const { result } of this.cache.values())
        releasePacket(result); this.cache.clear(); this.nodeResults.clear(); }
    async dispose() { this.cancel(); await this.tail; this.clearCache(); this.backend.dispose(); this.progress.clear(); }
}
