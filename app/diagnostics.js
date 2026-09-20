import { field, packet, releasePacket } from '@terraweave/core';
import { registry, defaults, createPreset } from '@terraweave/nodes';
import { CpuBackend } from '@terraweave/kernels';
import { GpuBackend, createGPUDevice } from '@terraweave/webgpu';
import { WebGPURenderer, WebGLRenderer } from '@terraweave/renderer';
import { ProjectStore, download } from '@terraweave/io';
const log = document.getElementById('log');
const runButton = document.getElementById('run');
const saveButton = document.getElementById('save');
let report, rendererGPU, rendererGL;
const node = (type, changes = {}) => ({ id: type, type, params: { ...defaults(type), ...changes }, enabled: true });
const n = 64, context = { worldSize: 4000, elevation: 1800 };
function record(name, status, detail = '') {
    const item = { name, status, detail };
    report.checks.push(item);
    log.textContent += `${status.padEnd(4)}  ${name}${detail ? '\n      ' + detail : ''}\n`;
}
function assert(condition, message) { if (!condition)
    throw new Error(message); }
function compare(actual, expected, label) {
    assert(actual.length === expected.length, label + ': dimensions differ');
    let maximum = 0, squared = 0;
    for (let i = 0; i < expected.length; i++) {
        const error = Math.abs(actual[i] - expected[i]);
        assert(Number.isFinite(actual[i]), label + ': non-finite sample at ' + i);
        assert(error <= 0.003 + 0.003 * Math.abs(expected[i]), `${label}: sample ${i}; CPU=${expected[i]}, GPU=${actual[i]}, abs error=${error}`);
        maximum = Math.max(maximum, error);
        squared += error * error;
    }
    return { maximum, rms: Math.sqrt(squared / expected.length) };
}
async function checkStorage() {
    const store = new ProjectStore(), key = 'diagnostic-' + Date.now();
    try {
        const project = createPreset('island');
        await store.set(project, key);
        store.close();
        const recovered = await store.get(key);
        assert(JSON.stringify(project) === JSON.stringify(recovered), 'Project differs after reopening database');
        const db = await store.open();
        await new Promise((resolve, reject) => {
            const tx = db.transaction('projects', 'readwrite');
            tx.objectStore('projects').delete(key);
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
        record('IndexedDB project round-trip', 'PASS');
    }
    catch (error) {
        record('IndexedDB project round-trip', error.name === 'SecurityError' ? 'SKIP' : 'FAIL', error.message);
    }
    finally {
        store.close();
    }
}
async function checkWorker() {
    const backend = new CpuBackend({ workerURL: new URL('../packages/kernels/src/worker.js', import.meta.url) });
    let result;
    try {
        result = await backend.run(node('mountain'), {}, n, context);
        assert(result.height.data.every(Number.isFinite), 'Worker returned non-finite samples');
        record('Module-worker terrain kernel', backend.workerURL ? 'PASS' : 'SKIP', backend.workerFailure || 'Input/output transfer completed');
    }
    catch (error) {
        record('Module-worker terrain kernel', 'FAIL', error.message);
    }
    finally {
        releasePacket(result);
        backend.dispose();
    }
}
async function checkGL(input, snapshot) {
    const canvas = document.getElementById('glCanvas');
    if (!canvas.getContext('webgl2')) {
        record('WebGL2 viewport', 'SKIP', 'No WebGL2 context');
        return;
    }
    try {
        rendererGL = await new WebGLRenderer(canvas).init();
        rendererGL.setTerrain(input, snapshot);
        for (const flat of [false, true])
            for (let mode = 0; mode <= 4; mode++) {
                rendererGL.setSettings({ mode, flat, contours: true, shadows: true });
                rendererGL.draw();
                assert(rendererGL.gl.getError() === rendererGL.gl.NO_ERROR, 'GL error in mode ' + mode);
            }
        rendererGL.setSettings({ mode: 0, flat: false });
        rendererGL.draw();
        record('WebGL2 viewport', 'PASS', 'All 10 display combinations rendered without GL errors');
    }
    catch (error) {
        record('WebGL2 viewport', 'FAIL', error.message);
    }
}
async function run() {
    runButton.disabled = true;
    saveButton.disabled = true;
    rendererGPU?.dispose();
    rendererGL?.dispose();
    rendererGPU = rendererGL = null;
    report = { version: 1, generated: new Date().toISOString(), userAgent: navigator.userAgent, secureContext: isSecureContext, checks: [] };
    log.textContent = '';
    const cpu = new CpuBackend();
    let source, second, gpu, gpuSource, gpuSecond, colorResult;
    try {
        await checkStorage();
        await checkWorker();
        source = await cpu.run(node('mountain'), {}, n, context);
        second = await cpu.run(node('gradient'), {}, n, context);
        colorResult = await cpu.run(node('biome'), { a: source }, n, context);
        await checkGL(colorResult, await cpu.read(colorResult));
        let adapter, device;
        try {
            ({ adapter, device } = await createGPUDevice());
        }
        catch (error) {
            record('WebGPU adapter', 'SKIP', error.message);
            return;
        }
        report.adapter = { vendor: adapter.info?.vendor, architecture: adapter.info?.architecture, description: adapter.info?.description };
        const errors = [];
        device.addEventListener('uncapturederror', event => errors.push(event.error.message));
        gpu = new GpuBackend(device);
        gpuSource = await gpu.upload(source);
        gpuSecond = await gpu.upload(second);
        record('WebGPU adapter', 'PASS', JSON.stringify(report.adapter));
        for (const [type, definition] of Object.entries(registry)) {
            let a, b;
            try {
                const target = node(type);
                if ('iterations' in target.params)
                    target.params.iterations = 4;
                if (type === 'import')
                    target.asset = { size: 2, data: [0.1, 0.3, 0.7, 0.4] };
                if (type === 'paint')
                    target.strokes = [{ x: 0.5, y: 0.5, radius: 0.2, strength: 0.08, mode: 'raise' }];
                const cpuInputs = {}, gpuInputs = {};
                for (const input of definition.inputs) {
                    cpuInputs[input] = input === 'a' ? source : second;
                    gpuInputs[input] = input === 'a' ? gpuSource : gpuSecond;
                }
                a = await cpu.run(target, cpuInputs, n, context);
                b = await gpu.run(target, gpuInputs, n, context);
                const expected = await cpu.read(a), actual = await gpu.read(b);
                const metrics = { height: compare(actual.height, expected.height, type + '/height') };
                for (const [key, values] of Object.entries(expected.maps)) {
                    assert(actual.maps[key], 'Missing output ' + key);
                    metrics[key] = compare(actual.maps[key], values, type + '/' + key);
                }
                if (expected.color)
                    metrics.color = compare(actual.color, expected.color, type + '/color');
                record('Kernel ' + type + (definition.op >= 103 ? ' [CPU bridge]' : ''), 'PASS', JSON.stringify(metrics));
            }
            catch (error) {
                record('Kernel ' + type, 'FAIL', error.message);
            }
            finally {
                releasePacket(a);
                releasePacket(b);
            }
        }
        let renderPacket;
        try {
            renderPacket = await gpu.upload(colorResult);
            rendererGPU = await new WebGPURenderer(document.getElementById('gpuCanvas'), device).init();
            rendererGPU.setTerrain(renderPacket);
            device.pushErrorScope('validation');
            try {
                for (const flat of [false, true])
                    for (let mode = 0; mode <= 4; mode++) {
                        rendererGPU.setSettings({ flat, mode, contours: true, water: true, shadows: true });
                        rendererGPU.draw();
                    }
                await device.queue.onSubmittedWorkDone();
            }
            finally {
                const error = await device.popErrorScope();
                if (error)
                    throw error;
            }
            const png = await rendererGPU.capture();
            assert(png.size > 100, 'Empty viewport capture');
            rendererGPU.setSettings({ flat: false, mode: 0 });
            rendererGPU.draw();
            record('Native WebGPU viewport', 'PASS', 'All 10 display combinations submitted; PNG canvas readback completed');
        }
        catch (error) {
            record('Native WebGPU viewport', 'FAIL', error.message);
        }
        finally {
            releasePacket(renderPacket);
        }
        await device.queue.onSubmittedWorkDone();
        record('Uncaptured GPU errors', errors.length ? 'FAIL' : 'PASS', errors.join('\n'));
    }
    catch (error) {
        record('Diagnostic runner', 'FAIL', error.stack || error.message);
    }
    finally {
        for (const result of [source, second, gpuSource, gpuSecond, colorResult])
            releasePacket(result);
        gpu?.dispose();
        cpu.dispose();
        report.summary = Object.fromEntries(['PASS', 'FAIL', 'SKIP'].map(status => [status, report.checks.filter(c => c.status === status).length]));
        log.textContent += '\n' + JSON.stringify(report.summary);
        window.terraweaveDiagnosticReport = report;
        saveButton.disabled = false;
        runButton.disabled = false;
    }
}
runButton.onclick = run;
saveButton.onclick = () => download(JSON.stringify(report, null, 2), 'terraweave-diagnostics.json', 'application/json');
if (new URLSearchParams(location.search).has('autorun'))
    run();
