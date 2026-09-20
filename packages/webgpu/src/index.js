import { Raster, packet, retainPacket, throwIfAborted, releasePacket } from '@terraweave/core';
import { registry } from '@terraweave/nodes';
import { CpuBackend, fromPlain } from '@terraweave/kernels';
import * as shaders from './shaders.js';
const inherit = p => Object.fromEntries(Object.entries(p?.maps || {}).map(([k, v]) => [k, v.retain()]));
export async function createGPUDevice() {
    if (!globalThis.navigator?.gpu)
        throw new Error('WebGPU is unavailable. A secure context and compatible browser/GPU are required.');
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter)
        throw new Error('No WebGPU adapter available');
    const device = await adapter.requestDevice({ label: 'TerraWeave compute + renderer' });
    return { adapter, device, description: [adapter.info?.vendor, adapter.info?.architecture, adapter.info?.description].filter(Boolean).join(' ') || 'WebGPU adapter' };
}
/** Resident GPU fields, ping-pong simulation state, asynchronous readback, explicit ownership. */
export class GpuBackend {
    constructor(device, { hybridBackend = null } = {}) { this.device = device; this.kind = 'WebGPU'; this.hybrid = hybridBackend || new CpuBackend(); this.pipelines = new Map(); this.zeros = new Map(); this.temp = new Set(); this.dummyColor = this.buffer(16); this.dummyAux = this.buffer(4); this.lost = false; device.lost.then(() => { this.lost = true; }); }
    buffer(size, usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST) { if (size > this.device.limits.maxBufferSize)
        throw new Error('Requested buffer exceeds adapter limits'); return this.device.createBuffer({ size: Math.max(4, size), usage }); }
    raster(n, channels = 1, data = null) { const buffer = this.buffer(n * n * channels * 4); if (data)
        this.device.queue.writeBuffer(buffer, 0, data); return new Raster(n, { buffer, channels, device: this.device }); }
    zero(n) { if (!this.zeros.has(n))
        this.zeros.set(n, this.raster(n)); return this.zeros.get(n); }
    uniforms(node, n, inputs = {}, context = {}, channel = 0) { const data = new ArrayBuffer(160), u = new Uint32Array(data), f = new Float32Array(data); u[0] = n; u[1] = registry[node.type].op; u[2] = channel; u[3] = (inputs.mask ? 1 : 0) | (inputs.b ? 2 : 0) | (inputs.a ? 4 : 0); Object.keys(registry[node.type].params).forEach((k, i) => { f[4 + i] = Number(node.params[k]); }); f[36] = context.worldSize || 4000; f[37] = context.elevation || 1800; const b = this.buffer(160, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST); this.device.queue.writeBuffer(b, 0, data); return b; }
    countUniform(count) { const b = this.buffer(32, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST); this.device.queue.writeBuffer(b, 0, new Uint32Array([count, 0, 0, 0, 0, 0, 0, 0])); return b; }
    async pipeline(name, source, entry = 'main', layout = 'auto') {
        const key = name + ':' + entry;
        if (!this.pipelines.has(key)) {
            this.pipelines.set(key, (async () => { const module = this.device.createShaderModule({ label: key, code: source }); const info = await module.getCompilationInfo(); const errors = info.messages.filter(m => m.type === 'error'); if (errors.length)
                throw new Error(`${key}: ${errors.map(e => `${e.lineNum}:${e.linePos} ${e.message}`).join('\n')}`); return this.device.createComputePipelineAsync({ label: key, layout, compute: { module, entryPoint: entry } }); })());
        }
        return this.pipelines.get(key);
    }
    group(pipeline, buffers) { return this.device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: buffers.map((buffer, binding) => ({ binding, resource: { buffer } })) }); }
    sparseGroup(pipeline, entries) { return this.device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: entries.map(([binding, buffer]) => ({ binding, resource: { buffer } })) }); }
    retire(buffers) { for (const b of buffers)
        this.temp.add(b); this.device.queue.onSubmittedWorkDone().then(() => { for (const b of buffers) {
        b.destroy();
        this.temp.delete(b);
    } }).catch(() => { for (const b of buffers) {
        b.destroy();
        this.temp.delete(b);
    } }); }
    /** Validation failures must abort before a result enters the content cache.
     * Error scopes are balanced even when compilation, cancellation or dispatch fails.
     */
    async run(node, inputs, n, context = {}) {
        if (this.lost)
            throw new Error('WebGPU device was lost');
        this.device.pushErrorScope('out-of-memory');
        this.device.pushErrorScope('validation');
        let result = null, failure = null;
        try {
            result = await this.runImpl(node, inputs, n, context);
        }
        catch (error) {
            failure = error;
        }
        for (let i = 0; i < 2; i++) {
            try {
                const error = await this.device.popErrorScope();
                if (error && !failure)
                    failure = new Error(`${node.type}: ${error.message}`);
            }
            catch (error) {
                failure ??= error;
            }
        }
        if (failure) {
            releasePacket(result);
            throw failure;
        }
        return result;
    }
    async runImpl(node, inputs, n, context = {}) {
        if (this.lost)
            throw new Error('WebGPU device was lost');
        throwIfAborted(context.signal);
        const op = registry[node.type].op;
        if (node.enabled === false || op === 31)
            return inputs.a ? retainPacket(inputs.a) : packet(this.raster(n));
        if (op === 100)
            return this.erosion(node, inputs, n, context);
        if (op === 101)
            return this.thermal(node, inputs, n, context);
        if (op === 102)
            return this.normalize(inputs.a, n, context);
        if (op >= 103) {
            const plain = {};
            for (const [k, v] of Object.entries(inputs))
                plain[k] = fromPlain(await this.read(v));
            try {
                const result = await this.hybrid.run(node, plain, n, context);
                try {
                    return await this.upload(result);
                }
                finally {
                    releasePacket(result);
                }
            }
            finally {
                for (const v of Object.values(plain))
                    releasePacket(v);
            }
        }
        const pipeline = await this.pipeline('general', shaders.general);
        throwIfAborted(context.signal);
        const out = this.raster(n), color = (op === 29 || op === 30) ? this.raster(n, 4) : null, aux = op === 12 ? this.raster(n) : null, uniform = this.uniforms(node, n, inputs, context);
        const group = this.group(pipeline, [uniform, (inputs.a?.height || this.zero(n)).buffer, (inputs.b?.height || this.zero(n)).buffer, (inputs.mask?.height || this.zero(n)).buffer, out.buffer, color?.buffer || this.dummyColor, aux?.buffer || this.dummyAux]);
        const encoder = this.device.createCommandEncoder({ label: node.type });
        const pass = encoder.beginComputePass();
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, group);
        pass.dispatchWorkgroups(Math.ceil(n / 8), Math.ceil(n / 8));
        pass.end();
        this.device.queue.submit([encoder.finish()]);
        this.retire([uniform]);
        const maps = (op >= 12 && op <= 23 || op === 29 || op === 30) ? inherit(inputs.a) : {};
        if (aux) {
            maps.snow?.release();
            maps.snow = aux;
        }
        return packet(out, maps, color);
    }
    async thermal(node, inputs, n, context) {
        const flux = await this.pipeline('thermal', shaders.thermal, 'flux'), gather = await this.pipeline('thermal', shaders.thermal, 'gather');
        const U = this.uniforms(node, n, inputs, context), M = (inputs.mask?.height || this.zero(n)).buffer, F = this.buffer(n * n * 16);
        let a = this.raster(n), b = this.raster(n);
        const init = this.device.createCommandEncoder();
        init.copyBufferToBuffer((inputs.a?.height || this.zero(n)).buffer, 0, a.buffer, 0, n * n * 4);
        this.device.queue.submit([init.finish()]);
        try {
            for (let start = 0; start < node.params.iterations; start += 16) {
                throwIfAborted(context.signal);
                const e = this.device.createCommandEncoder();
                const pass = e.beginComputePass();
                for (let it = start; it < Math.min(start + 16, node.params.iterations); it++) {
                    pass.setPipeline(flux);
                    pass.setBindGroup(0, this.sparseGroup(flux, [[0, U], [1, a.buffer], [2, M], [3, F]]));
                    pass.dispatchWorkgroups(Math.ceil(n / 8), Math.ceil(n / 8));
                    pass.setPipeline(gather);
                    pass.setBindGroup(0, this.sparseGroup(gather, [[0, U], [1, a.buffer], [3, F], [4, b.buffer]]));
                    pass.dispatchWorkgroups(Math.ceil(n / 8), Math.ceil(n / 8));
                    [a, b] = [b, a];
                }
                pass.end();
                this.device.queue.submit([e.finish()]);
                await this.device.queue.onSubmittedWorkDone();
                context.onStep?.(Math.min(start + 16, node.params.iterations) / node.params.iterations);
            }
            b.release();
            this.retire([U, F]);
            return packet(a, inherit(inputs.a));
        }
        catch (e) {
            a.release();
            b.release();
            this.retire([U, F]);
            throw e;
        }
    }
    async erosion(node, inputs, n, context) {
        const init = await this.pipeline('hydraulic', shaders.hydraulic, 'init'), flux = await this.pipeline('hydraulic', shaders.hydraulic, 'flux'), erode = await this.pipeline('hydraulic', shaders.hydraulic, 'erode'), extract = await this.pipeline('hydraulic', shaders.hydraulic, 'extract');
        const U = this.uniforms(node, n, inputs, context), H = (inputs.a?.height || this.zero(n)).buffer, M = (inputs.mask?.height || this.zero(n)).buffer;
        let a = this.buffer(n * n * 16), b = this.buffer(n * n * 16);
        const F = this.buffer(n * n * 16), D = this.buffer(n * n * 16), temporary = [U, a, b, F, D];
        try {
            const initEncoder = this.device.createCommandEncoder(), p0 = initEncoder.beginComputePass();
            p0.setPipeline(init);
            p0.setBindGroup(0, this.sparseGroup(init, [[0, U], [1, H], [4, a]]));
            p0.dispatchWorkgroups(Math.ceil(n / 8), Math.ceil(n / 8));
            p0.end();
            this.device.queue.submit([initEncoder.finish()]);
            for (let start = 0; start < node.params.iterations; start += 16) {
                throwIfAborted(context.signal);
                const enc = this.device.createCommandEncoder();
                const pass = enc.beginComputePass();
                for (let it = start; it < Math.min(start + 16, node.params.iterations); it++) {
                    pass.setPipeline(flux);
                    pass.setBindGroup(0, this.sparseGroup(flux, [[0, U], [2, M], [3, a], [5, F]]));
                    pass.dispatchWorkgroups(Math.ceil(n / 8), Math.ceil(n / 8));
                    pass.setPipeline(erode);
                    pass.setBindGroup(0, this.sparseGroup(erode, [[0, U], [2, M], [3, a], [4, b], [5, F], [6, D]]));
                    pass.dispatchWorkgroups(Math.ceil(n / 8), Math.ceil(n / 8));
                    [a, b] = [b, a];
                }
                pass.end();
                this.device.queue.submit([enc.finish()]);
                await this.device.queue.onSubmittedWorkDone();
                context.onStep?.(Math.min(start + 16, node.params.iterations) / node.params.iterations);
            }
            const names = ['height', 'flow', 'wear', 'deposition', 'water'], results = {};
            const enc = this.device.createCommandEncoder();
            const pass = enc.beginComputePass();
            pass.setPipeline(extract);
            for (let channel = 0; channel < names.length; channel++) {
                const target = this.raster(n), uniform = this.uniforms(node, n, inputs, context, channel);
                temporary.push(uniform);
                results[names[channel]] = target;
                pass.setBindGroup(0, this.sparseGroup(extract, [[0, uniform], [3, a], [6, D], [7, target.buffer]]));
                pass.dispatchWorkgroups(Math.ceil(n / 8), Math.ceil(n / 8));
            }
            pass.end();
            this.device.queue.submit([enc.finish()]);
            const { height, ...maps } = results;
            return packet(height, maps);
        }
        finally {
            this.retire(temporary);
        }
    }
    async normalize(input, n, context) {
        const reduce = await this.pipeline('reduce', shaders.reduction, 'reduce'), pairs = await this.pipeline('reducePairs', shaders.reducePairs, 'reduce'), apply = await this.pipeline('normalize', shaders.normalize);
        const H = (input?.height || this.zero(n)).buffer, temporary = [];
        let count = n * n, source = H, first = true;
        const encoder = this.device.createCommandEncoder();
        const pass = encoder.beginComputePass();
        while (count > 1) {
            const groups = Math.ceil(count / 256), target = this.buffer(groups * 8), uniform = this.countUniform(count), pipeline = first ? reduce : pairs;
            temporary.push(target, uniform);
            pass.setPipeline(pipeline);
            pass.setBindGroup(0, this.group(pipeline, [uniform, source, target]));
            pass.dispatchWorkgroups(groups);
            source = target;
            count = groups;
            first = false;
        }
        const output = this.raster(n), uniform = this.countUniform(n * n);
        temporary.push(uniform);
        pass.setPipeline(apply);
        pass.setBindGroup(0, this.group(apply, [uniform, H, source, output.buffer]));
        pass.dispatchWorkgroups(Math.ceil(n * n / 256));
        pass.end();
        this.device.queue.submit([encoder.finish()]);
        this.retire(temporary);
        return packet(output);
    }
    async readRaster(r) { if (r.data)
        return r.data; const readback = this.buffer(r.byteLength, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST); try {
        const encoder = this.device.createCommandEncoder();
        encoder.copyBufferToBuffer(r.buffer, 0, readback, 0, r.byteLength);
        this.device.queue.submit([encoder.finish()]);
        await readback.mapAsync(GPUMapMode.READ);
        const data = new Float32Array(readback.getMappedRange().slice(0));
        readback.unmap();
        return data;
    }
    finally {
        readback.destroy();
    } }
    async read(p) { const hold = retainPacket(p); try {
        const entries = await Promise.all(Object.entries(p.maps).map(async ([k, r]) => [k, await this.readRaster(r)]));
        return { size: p.size, height: await this.readRaster(p.height), maps: Object.fromEntries(entries), color: p.color ? await this.readRaster(p.color) : null };
    }
    finally {
        releasePacket(hold);
    } }
    async upload(p) { const height = this.raster(p.size, 1, p.height.data), maps = Object.fromEntries(Object.entries(p.maps).map(([k, r]) => [k, this.raster(p.size, 1, r.data)])), color = p.color ? this.raster(p.size, 4, p.color.data) : null; return packet(height, maps, color); }
    dispose() { for (const r of this.zeros.values())
        r.release(); this.zeros.clear(); for (const b of this.temp)
        b.destroy(); this.temp.clear(); this.dummyColor.destroy(); this.dummyAux.destroy(); this.hybrid.dispose(); }
}
