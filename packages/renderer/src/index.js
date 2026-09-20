import { retainPacket, releasePacket } from '@terraweave/core';
import { drawSoftware } from './software.js';
import { OrbitCamera } from './camera.js';
import { backgroundShader, floorShader, terrainShader } from './shaders.js';
import { vertexGL, fragmentGL } from './gl.js';
export { OrbitCamera };
class BaseRenderer {
    constructor(canvas) { this.canvas = canvas; this.canvas.tabIndex = 0; this.canvas.style.touchAction = 'none'; this.camera = new OrbitCamera(canvas, () => this.invalidate()); this.settings = { mode: 0, flat: false, contours: false, shadows: true, grid: true, water: true, waterLevel: .03, heightScale: .9, exposure: 1.04, sunAzimuth: 135, sunAltitude: 42, palette: 0, snowLine: .6 }; this.range = [0, 1]; this.n = 2; this.segments = 1; this.hasColor = false; this.ready = false; this.frame = 0; this.held = null; this.onFrame = null; this.resizeObserver = new ResizeObserver(() => this.invalidate()); this.resizeObserver.observe(canvas); this.disposed = false; }
    setSettings(settings) { Object.assign(this.settings, settings); this.camera.enabled = !this.settings.flat; this.invalidate(); }
    clear() { releasePacket(this.held); this.held = null; this.hasColor = false; this.invalidate(); }
    setRange(min, max) { this.range = [min, max]; this.invalidate(); }
    invalidate() { if (this.disposed || this.frame)
        return; this.frame = requestAnimationFrame(() => { this.frame = 0; if (this.ready)
        this.draw(); }); }
    uniforms(webgpu = true) { const a = new Float32Array(44), s = this.settings, w = this.canvas.width, h = this.canvas.height; a.set(this.camera.matrix(w / h, webgpu), 0); a.set([...this.camera.eye, 1], 16); const az = s.sunAzimuth * Math.PI / 180, el = s.sunAltitude * Math.PI / 180; a.set([Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el), 1], 20); a.set([this.n, this.segments, s.heightScale, s.waterLevel], 24); a.set([s.mode, this.hasColor ? 1 : 0, s.contours ? 1 : 0, s.shadows ? 1 : 0], 28); a.set([w, h, performance.now() / 1000, s.exposure], 32); a.set([s.palette, s.snowLine, s.water ? 1 : 0, s.grid ? 1 : 0], 36); a.set([...this.range, 0, 0], 40); return a; }
    dimensions() { const rect = this.canvas.getBoundingClientRect(), dpr = Math.min(2, globalThis.devicePixelRatio || 1); return [Math.max(1, Math.round(rect.width * dpr)), Math.max(1, Math.round(rect.height * dpr))]; }
    hold(result) { releasePacket(this.held); this.held = retainPacket(result); this.n = result.size; this.segments = Math.min(384, result.size - 1); this.hasColor = !!result.color; }
    mapCoordinates(clientX, clientY) { const r = this.canvas.getBoundingClientRect(), side = Math.min(r.width, r.height) * .86; return { x: (clientX - r.left - r.width * .5) / side + .5, y: (clientY - r.top - r.height * .5) / side + .5 }; }
    async capture() { this.draw(); if (this.device)
        await this.device.queue.onSubmittedWorkDone(); return new Promise((resolve, reject) => this.canvas.toBlob(b => b ? resolve(b) : reject(new Error('Viewport capture failed')), 'image/png')); }
    dispose() { this.disposed = true; cancelAnimationFrame(this.frame); this.resizeObserver.disconnect(); this.camera.dispose(); releasePacket(this.held); this.held = null; }
}
export class WebGPURenderer extends BaseRenderer {
    constructor(canvas, device) { super(canvas); this.device = device; this.kind = 'WebGPU'; this.context = canvas.getContext('webgpu'); if (!this.context)
        throw new Error('Cannot create a WebGPU canvas'); this.format = navigator.gpu.getPreferredCanvasFormat(); this.context.configure({ device, format: this.format, alphaMode: 'opaque' }); this.uniformBuffer = device.createBuffer({ size: 176, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }); this.dummyH = device.createBuffer({ size: 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST }); this.dummyC = device.createBuffer({ size: 64, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST }); this.heightBuffer = this.dummyH; this.colorBuffer = this.dummyC; this.owned = []; this.groups = {}; }
    async init() {
        this.sceneLayout = this.device.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform', minBindingSize: 176 } }, { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage', minBindingSize: 4 } }, { binding: 2, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage', minBindingSize: 16 } }] });
        this.pipelineLayout = this.device.createPipelineLayout({ bindGroupLayouts: [this.sceneLayout] });
        const create = async (label, code, vs = 'vs', fs = 'fs', depth = true) => { const module = this.device.createShaderModule({ label, code }); const info = await module.getCompilationInfo(); const errors = info.messages.filter(m => m.type === 'error'); if (errors.length)
            throw new Error(`${label}: ${errors.map(m => `${m.lineNum}: ${m.message}`).join('\n')}`); return this.device.createRenderPipelineAsync({ label, layout: this.pipelineLayout, vertex: { module, entryPoint: vs }, fragment: { module, entryPoint: fs, targets: [{ format: this.format }] }, primitive: { topology: 'triangle-list', cullMode: 'none' }, depthStencil: { format: 'depth24plus', depthWriteEnabled: depth && label !== 'water', depthCompare: depth ? 'less-equal' : 'always' }, multisample: { count: 4 } }); };
        this.pipelines = { background: await create('background', backgroundShader, 'vs', 'fs', false), floor: await create('floor', floorShader), terrain: await create('terrain', terrainShader), water: await create('water', terrainShader, 'waterVS', 'waterFS'), flat: await create('flat', terrainShader, 'flatVS', 'flatFS', false) };
        this.rebind();
        this.ready = true;
        this.invalidate();
        return this;
    }
    rebind() { for (const [name, p] of Object.entries(this.pipelines)) {
        const entries = [{ binding: 0, resource: { buffer: this.uniformBuffer } }];
        {
            entries.push({ binding: 1, resource: { buffer: this.heightBuffer } }, { binding: 2, resource: { buffer: this.colorBuffer } });
        }
        this.groups[name] = this.device.createBindGroup({ layout: p.getBindGroupLayout(0), entries });
    } }
    upload(data) { const b = this.device.createBuffer({ size: Math.max(16, data.byteLength), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST }); this.device.queue.writeBuffer(b, 0, data); this.owned.push(b); return b; }
    setTerrain(result) { for (const b of this.owned)
        b.destroy(); this.owned = []; this.hold(result); this.heightBuffer = result.height.buffer || this.upload(result.height.data); this.colorBuffer = result.color ? (result.color.buffer || this.upload(result.color.data)) : this.dummyC; this.rebind(); this.invalidate(); }
    resize() { const [w, h] = this.dimensions(); if (this.canvas.width === w && this.canvas.height === h && this.depth)
        return; this.canvas.width = w; this.canvas.height = h; this.depth?.destroy(); this.msaa?.destroy(); this.depth = this.device.createTexture({ size: [w, h], sampleCount: 4, format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT }); this.msaa = this.device.createTexture({ size: [w, h], sampleCount: 4, format: this.format, usage: GPUTextureUsage.RENDER_ATTACHMENT }); }
    draw() {
        if (!this.ready || this.disposed)
            return;
        const start = performance.now();
        this.resize();
        this.device.queue.writeBuffer(this.uniformBuffer, 0, this.uniforms());
        const encoder = this.device.createCommandEncoder();
        const pass = encoder.beginRenderPass({ colorAttachments: [{ view: this.msaa.createView(), resolveTarget: this.context.getCurrentTexture().createView(), clearValue: { r: .05, g: .07, b: .08, a: 1 }, loadOp: 'clear', storeOp: 'discard' }], depthStencilAttachment: { view: this.depth.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'discard' } });
        const draw = (name, count) => { pass.setPipeline(this.pipelines[name]); pass.setBindGroup(0, this.groups[name]); pass.draw(count); };
        if (this.settings.flat && this.held)
            draw('flat', 3);
        else {
            draw('background', 3);
            draw('floor', 6);
            if (this.held) {
                draw('terrain', (this.segments * this.segments + 4 * this.segments) * 6);
                if (this.settings.water)
                    draw('water', 6);
            }
        }
        pass.end();
        this.device.queue.submit([encoder.finish()]);
        this.onFrame?.({ cpuMs: performance.now() - start, triangles: this.segments * this.segments * 2, kind: this.kind });
    }
    dispose() { super.dispose(); this.depth?.destroy(); this.msaa?.destroy(); this.uniformBuffer.destroy(); this.dummyH.destroy(); this.dummyC.destroy(); for (const b of this.owned)
        b.destroy(); this.context.unconfigure(); }
}
export class WebGLRenderer extends BaseRenderer {
    constructor(canvas) { super(canvas); this.kind = 'WebGL2'; this.gl = canvas.getContext('webgl2', { antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' }); if (!this.gl)
        throw new Error('WebGL2 is unavailable. Enable hardware acceleration.'); this.contextLost = false; canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.contextLost = true; this.onError?.(new Error('WebGL context lost. Reload to recover.')); }); }
    async init() { const gl = this.gl; const shader = (type, code) => { const s = gl.createShader(type); gl.shaderSource(s, code); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
        throw new Error(gl.getShaderInfoLog(s)); return s; }; this.program = gl.createProgram(); const vs = shader(gl.VERTEX_SHADER, vertexGL), fs = shader(gl.FRAGMENT_SHADER, fragmentGL); gl.attachShader(this.program, vs); gl.attachShader(this.program, fs); gl.linkProgram(this.program); gl.deleteShader(vs); gl.deleteShader(fs); if (!gl.getProgramParameter(this.program, gl.LINK_STATUS))
        throw new Error(gl.getProgramInfoLog(this.program)); gl.useProgram(this.program); this.passLocation = gl.getUniformLocation(this.program, 'uPass'); gl.uniform1i(gl.getUniformLocation(this.program, 'uHeight'), 0); gl.uniform1i(gl.getUniformLocation(this.program, 'uColor'), 1); gl.uniformBlockBinding(this.program, gl.getUniformBlockIndex(this.program, 'Scene'), 0); this.ubo = gl.createBuffer(); gl.bindBuffer(gl.UNIFORM_BUFFER, this.ubo); gl.bufferData(gl.UNIFORM_BUFFER, 176, gl.DYNAMIC_DRAW); gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, this.ubo); this.vao = gl.createVertexArray(); gl.bindVertexArray(this.vao); this.htex = gl.createTexture(); this.ctex = gl.createTexture(); this.texture(0, this.htex, 2, new Float32Array(4), false); this.texture(1, this.ctex, 2, new Float32Array(16), true); this.ready = true; this.invalidate(); return this; }
    texture(unit, tex, n, data, color) { const gl = this.gl; gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); gl.texImage2D(gl.TEXTURE_2D, 0, color ? gl.RGBA32F : gl.R32F, n, n, 0, color ? gl.RGBA : gl.RED, gl.FLOAT, data); }
    setTerrain(result, snapshot = null) { this.hold(result); const p = snapshot || { height: result.height.data, color: result.color?.data }; if (!p.height)
        throw new Error('WebGL renderer needs a CPU snapshot'); this.texture(0, this.htex, result.size, p.height, false); this.texture(1, this.ctex, p.color ? result.size : 2, p.color || new Float32Array(16), true); this.invalidate(); }
    draw() { if (!this.ready || this.disposed || this.contextLost)
        return; const gl = this.gl, start = performance.now(), [w, h] = this.dimensions(); if (this.canvas.width !== w || this.canvas.height !== h) {
        this.canvas.width = w;
        this.canvas.height = h;
    } gl.viewport(0, 0, w, h); gl.useProgram(this.program); gl.bindVertexArray(this.vao); gl.bindBuffer(gl.UNIFORM_BUFFER, this.ubo); gl.bufferSubData(gl.UNIFORM_BUFFER, 0, this.uniforms(false)); gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, this.ubo); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.htex); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.ctex); gl.clearColor(.05, .07, .08, 1); gl.depthMask(true); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.disable(gl.CULL_FACE); const draw = (pass, count) => { gl.uniform1i(this.passLocation, pass); gl.drawArrays(gl.TRIANGLES, 0, count); }; gl.disable(gl.DEPTH_TEST); if (this.settings.flat && this.held)
        draw(2, 3);
    else {
        draw(-1, 3);
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        draw(-2, 6);
        if (this.held) {
            draw(0, (this.segments * this.segments + 4 * this.segments) * 6);
            if (this.settings.water) {
                gl.depthMask(false);
                draw(1, 6);
                gl.depthMask(true);
            }
        }
    } this.onFrame?.({ cpuMs: performance.now() - start, triangles: this.segments * this.segments * 2, kind: this.kind }); }
    dispose() { super.dispose(); const gl = this.gl; gl.deleteTexture(this.htex); gl.deleteTexture(this.ctex); gl.deleteBuffer(this.ubo); gl.deleteVertexArray(this.vao); gl.deleteProgram(this.program); }
}
export class SoftwareRenderer extends BaseRenderer {
    constructor(canvas) { super(canvas); this.kind = 'Software'; this.context2d = canvas.getContext('2d', { alpha: false }); if (!this.context2d)
        throw new Error('Canvas rendering is unavailable'); this.snapshot = null; }
    async init() { this.ready = true; this.invalidate(); return this; }
    setTerrain(result, snapshot = null) { this.hold(result); this.snapshot = snapshot || { size: result.size, height: result.height.data, color: result.color?.data }; if (!this.snapshot.height)
        throw new Error('Software rendering requires a CPU snapshot'); this.invalidate(); }
    draw() { if (!this.ready || this.disposed)
        return; const start = performance.now(); drawSoftware(this); this.onFrame?.({ cpuMs: performance.now() - start, triangles: Math.min(128, this.segments) ** 2 * 2, kind: this.kind }); }
}
export async function createRenderer(canvas, { device = null } = {}) { const renderer = device ? new WebGPURenderer(canvas, device) : canvas.getContext('webgl2', { antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' }) ? new WebGLRenderer(canvas) : new SoftwareRenderer(canvas); try {
    return await renderer.init();
}
catch (error) {
    renderer.dispose();
    throw error;
} }
