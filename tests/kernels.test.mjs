import test from 'node:test';
import assert from 'node:assert/strict';
import { runCPU, thermalCPU, hydraulicCPU } from '../dist/packages/kernels/src/index.js';
import { registry, defaults } from '../dist/packages/nodes/src/index.js';
import { field, packet, releasePacket } from '../dist/packages/core/src/index.js';
import { hash2, noise2, statistics } from '../dist/packages/math/src/index.js';
const n = 64, context = { worldSize: 4000, elevation: 1800 }, node = (type, params = {}) => ({ id: type, type, params: { ...defaults(type), ...params }, enabled: true }), sum = a => a.reduce((s, v) => s + v, 0), error = (a, b) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / a.length;
test('noise is finite, seeded and deterministic across signed coordinates', () => { assert.equal(hash2(-23, 57, 22), hash2(-23, 57, 22)); assert.notEqual(hash2(1, 2, 3), hash2(1, 2, 4)); for (let y = -4; y < 4; y++)
    for (let x = -4; x < 4; x++) {
        const v = noise2(x * .7, y * .2, 23);
        assert.ok(v >= 0 && v <= 1);
    } });
for (const [type, d] of Object.entries(registry))
    test(`kernel ${type}: finite outputs and declared dimensions`, async () => { const input = await runCPU(node('mountain'), {}, n, context), second = await runCPU(node('gradient'), {}, n, context), target = node(type); if ('iterations' in target.params)
        target.params.iterations = 4; if (type === 'import')
        target.asset = { size: 2, data: [.1, .2, .3, .8] }; if (type === 'paint')
        target.strokes = [{ x: .5, y: .5, radius: .2, strength: .1, mode: 'raise' }]; const inputs = {}; for (const k of d.inputs)
        inputs[k] = k === 'a' ? input : second; const result = await runCPU(target, inputs, n, context); assert.equal(result.size, n); for (const raster of [result.height, ...Object.values(result.maps), ...(result.color ? [result.color] : [])]) {
        assert.equal(raster.data.length, n * n * raster.channels);
        assert.ok(raster.data.every(Number.isFinite));
    } for (const port of d.outputs) {
        if (!['height', 'color'].includes(port))
            assert.ok(result.maps[port], `${type} must produce ${port}`);
        if (port === 'color')
            assert.ok(result.color);
    } releasePacket(input); releasePacket(second); releasePacket(result); });
test('generators are deterministic and seeds affect terrain', async () => { for (const type of Object.keys(registry).filter(t => 'seed' in defaults(t) && registry[t].inputs.length === 0)) {
    const a = await runCPU(node(type), {}, n, context), b = await runCPU(node(type), {}, n, context), c = await runCPU(node(type, { seed: 121 }), {}, n, context);
    assert.deepEqual(a.height.data, b.height.data);
    assert.ok(error(a.height.data, c.height.data) > 1e-5, type);
    [a, b, c].forEach(releasePacket);
} });
test('volcano rim sharpness changes the heightfield', async () => { const a = await runCPU(node('volcano', { rim: 1 }), {}, n), b = await runCPU(node('volcano', { rim: 8 }), {}, n); assert.ok(error(a.height.data, b.height.data) > 1e-4); [a, b].forEach(releasePacket); });
test('thermal transport conserves material and a zero mask is identity', async () => { const input = await runCPU(node('mountain'), {}, n, context), params = { ...defaults('thermal'), iterations: 25, talus: 0 }, a = await thermalCPU(input, n, params, null, context), zero = await thermalCPU(input, n, params, new Float32Array(n * n), context); assert.ok(Math.abs(sum(input.height.data) - sum(a.height.data)) < .002); assert.ok(error(input.height.data, a.height.data) > .001); assert.deepEqual(input.height.data, zero.height.data); [input, a, zero].forEach(releasePacket); });
test('hydraulic transport conserves terrain plus settled sediment', async () => { const input = await runCPU(node('mountain'), {}, n, context), a = await hydraulicCPU(input, n, { ...defaults('hydraulic'), iterations: 40 }, null, context); assert.ok(Math.abs(sum(input.height.data) - sum(a.height.data)) < .004, `mass delta ${sum(input.height.data) - sum(a.height.data)}`); assert.ok(error(input.height.data, a.height.data) > 1e-4); assert.ok(sum(a.maps.flow.data) > 0); assert.ok(sum(a.maps.wear.data) > 0); assert.ok(sum(a.maps.deposition.data) > 0); assert.ok(a.maps.water.data.every(v => v >= 0)); [input, a].forEach(releasePacket); });
test('dry hydraulic field does not spontaneously erode', async () => { const input = await runCPU(node('mountain'), {}, n, context), a = await hydraulicCPU(input, n, { ...defaults('hydraulic'), iterations: 10, rain: 0 }, null, context); assert.deepEqual(a.height.data, input.height.data); assert.equal(sum(a.maps.flow.data), 0); [input, a].forEach(releasePacket); });
test('simulation handles negative imported elevations without inverted flux', async () => { const values = Float32Array.from({ length: n * n }, (_, i) => -.3 + i / (n * n) * .1), input = packet(field(values, n)), a = await thermalCPU(input, n, { ...defaults('thermal'), iterations: 3, talus: 0 }, null, context), b = await hydraulicCPU(input, n, { ...defaults('hydraulic'), iterations: 3 }, null, context); assert.deepEqual(a.height.data, values); assert.ok(b.height.data.every(Number.isFinite)); assert.ok(b.maps.wear.data.every(v => v >= 0)); [input, a, b].forEach(releasePacket); });
test('zero masks preserve base terrain and uncolored biome height', async () => { const input = await runCPU(node('mountain'), {}, n, context), mask = packet(field(new Float32Array(n * n), n)); for (const type of ['invert', 'terrace', 'blur', 'snow', 'biome']) {
    const a = await runCPU(node(type), { a: input, mask }, n, context);
    assert.deepEqual(a.height.data, input.height.data);
    if (type === 'biome')
        for (let i = 0; i < n * n; i++)
            assert.equal(a.color.data[i * 4], input.height.data[i]);
    releasePacket(a);
} releasePacket(mask); releasePacket(input); });
test('normalization handles constant fields and remaps extrema', async () => { for (const type of ['constant', 'mountain']) {
    const input = await runCPU(node(type), {}, n, context), out = await runCPU(node('normalize'), { a: input }, n, context), stats = statistics(out.height.data);
    assert.equal(stats.min, 0);
    assert.equal(stats.max, type === 'constant' ? 0 : 1);
    [input, out].forEach(releasePacket);
} });
test('sculpt strokes replay deterministically and modify a local neighborhood', async () => { const base = packet(field(new Float32Array(n * n).fill(.3), n)), target = { ...node('paint'), strokes: [{ x: .5, y: .5, radius: .12, strength: .05, mode: 'raise' }] }, a = await runCPU(target, { a: base }, n), b = await runCPU(target, { a: base }, n); assert.deepEqual(a.height.data, b.height.data); assert.ok(a.height.data[32 * n + 32] > .34); assert.equal(a.height.data[0], base.height.data[0]); [base, a, b].forEach(releasePacket); });
