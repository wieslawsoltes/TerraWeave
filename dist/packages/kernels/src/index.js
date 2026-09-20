import { Raster, packet, retainPacket, throwIfAborted } from '../../core/src/index.js';
import { clamp, lerp, smoothstep, hash2, noise2, fbm, cellular, sample } from '../../math/src/index.js';
import { registry } from '../../nodes/src/index.js';
const DIR = [[-1, 0], [1, 0], [0, -1], [0, 1]], OPP = [1, 0, 3, 2];
const raster = (n, data = new Float32Array(n * n), channels = 1) => new Raster(n, { data, channels });
const inherited = (input) => Object.fromEntries(Object.entries(input?.maps || {}).map(([k, v]) => [k, v.retain()]));
function gradient(a, n, x, y) { return [(sample(a, n, x + 1, y) - sample(a, n, x - 1, y)) * (n - 1) * .5, (sample(a, n, x, y + 1) - sample(a, n, x, y - 1)) * (n - 1) * .5]; }
export const palettes = [
    [[.09, .14, .10], [.24, .29, .16], [.35, .34, .30], [.87, .91, .92]],
    [[.20, .10, .055], [.46, .25, .12], [.72, .51, .28], [.91, .76, .51]],
    [[.065, .065, .075], [.17, .15, .16], [.32, .30, .31], [.71, .70, .71]],
    [[.055, .16, .12], [.14, .28, .14], [.41, .45, .30], [.83, .81, .66]],
    [[.11, .20, .25], [.25, .34, .39], [.55, .65, .69], [.90, .95, .98]]
];
export function terrainColor(h, slope, curv, variation, palette = 0, snowLine = .6, rockSlope = .6) {
    const c = palettes[palette] || palettes[0];
    let t = smoothstep(.06, .42, h), out = c[0].map((v, i) => lerp(v, c[1][i], t));
    t = smoothstep(rockSlope * .25, rockSlope * 1.8, slope);
    out = out.map((v, i) => lerp(v, c[2][i], t));
    const snow = smoothstep(snowLine - .035, snowLine + .08, h + variation * .025) * (1 - smoothstep(1.1, 3, slope));
    if (palette === 0 || palette === 4)
        out = out.map((v, i) => lerp(v, c[3][i], snow));
    else
        out = out.map((v, i) => lerp(v, c[3][i], smoothstep(.25, .95, h) * .65));
    return out.map(v => clamp(v * (1 + variation) * (.92 + clamp(curv, -.1, .1))));
}
function colorAt(a, n, x, y, p, isGradient, ratio) { const i = y * n + x, h = a[i], g = gradient(a, n, x, y), slope = Math.hypot(...g) / ratio; const v = (noise2(x * .14, y * .14, 722) - .5) * 2 * (p.variation ?? .08); if (isGradient) {
    const stops = palettes[p.palette], t = clamp((h - p.low) / Math.max(.001, p.high - p.low)) * 3, j = Math.min(2, Math.floor(t));
    return stops[j].map((v, i) => lerp(v, stops[j + 1][i], t - j));
} return terrainColor(h, slope, 0, v, p.palette, p.snowLine, p.rockSlope); }
export async function runCPU(node, inputs, n, context = {}) {
    throwIfAborted(context.signal);
    const p = node.params, op = registry[node.type].op, A = inputs.a?.height.data, B = inputs.b?.height.data, M = inputs.mask?.height.data, ratio = (context.worldSize || 4000) / (context.elevation || 1800);
    if (node.type === 'output' || node.enabled === false) {
        if (inputs.a)
            return retainPacket(inputs.a);
        return packet(raster(n));
    }
    if (op === 100)
        return hydraulicCPU(inputs.a, n, p, M, context);
    if (op === 101)
        return thermalCPU(inputs.a, n, p, M, context);
    const out = new Float32Array(n * n);
    let colors = null, maps = {};
    if (op === 102) {
        if (A) {
            let min = Infinity, max = -Infinity;
            for (const v of A) {
                min = Math.min(min, v);
                max = Math.max(max, v);
            }
            for (let i = 0; i < out.length; i++)
                out[i] = (A[i] - min) / (max - min || 1);
        }
        return packet(raster(n, out));
    }
    if (op === 103) {
        if (A) {
            const order = Uint32Array.from({ length: n * n }, (_, i) => i);
            order.sort((a, b) => A[b] - A[a]);
            const acc = new Float32Array(n * n);
            acc.fill(1);
            for (const i of order) {
                let target = -1, steep = 0;
                const x = i % n, y = (i / n) | 0;
                for (let dy = -1; dy <= 1; dy++)
                    for (let dx = -1; dx <= 1; dx++) {
                        if (!(dx || dy) || x + dx < 0 || x + dx >= n || y + dy < 0 || y + dy >= n)
                            continue;
                        const j = (y + dy) * n + x + dx, d = (A[i] - A[j]) / Math.hypot(dx, dy);
                        if (d > steep) {
                            steep = d;
                            target = j;
                        }
                    }
                if (target >= 0)
                    acc[target] += acc[i];
            }
            let max = 1;
            for (const v of acc)
                max = Math.max(max, v);
            for (let i = 0; i < out.length; i++)
                out[i] = Math.pow(Math.log1p(acc[i]) / Math.log1p(max), 1 / p.strength);
        }
        return packet(raster(n, out));
    }
    if (op === 104) {
        if (A)
            out.set(A);
        else
            out.fill(p.base);
        for (const s of node.strokes || []) {
            const cx = s.x * (n - 1), cy = s.y * (n - 1), r = s.radius * n;
            const source = (s.mode === 'smooth') ? out.slice() : out;
            for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(n - 1, Math.ceil(cy + r)); y++)
                for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(n - 1, Math.ceil(cx + r)); x++) {
                    const w = 1 - smoothstep(0, r, Math.hypot(x - cx, y - cy)), i = y * n + x;
                    if (s.mode === 'smooth') {
                        const avg = (sample(source, n, x - 1, y) + sample(source, n, x + 1, y) + sample(source, n, x, y - 1) + sample(source, n, x, y + 1)) / 4;
                        out[i] = lerp(source[i], avg, w * Math.abs(s.strength) * 8);
                    }
                    else if (s.mode === 'flatten')
                        out[i] = lerp(out[i], s.target ?? .3, w * Math.abs(s.strength) * 8);
                    else
                        out[i] = clamp(out[i] + w * s.strength);
                }
        }
        return packet(raster(n, out));
    }
    if (op === 105) {
        const asset = node.asset;
        if (asset)
            for (let y = 0; y < n; y++)
                for (let x = 0; x < n; x++)
                    out[y * n + x] = sample(asset.data, asset.size, x / (n - 1) * (asset.size - 1), y / (n - 1) * (asset.size - 1)) * p.gain + p.offset;
        return packet(raster(n, out));
    }
    if (op === 29 || op === 30)
        colors = new Float32Array(n * n * 4);
    if (op === 12)
        maps.snow = raster(n);
    for (let y = 0; y < n; y++) {
        if ((y & 31) === 0)
            throwIfAborted(context.signal);
        for (let x = 0; x < n; x++) {
            const i = y * n + x, u = x / (n - 1), v = y / (n - 1), px = u * 2 - 1, py = v * 2 - 1, a = A?.[i] || 0, b = B?.[i] || 0, m = M ? clamp(M[i]) : 1;
            let value = a;
            if (op <= 9) {
                const seed = p.seed, wx = (noise2(u * 3 + 5, v * 3 + 1, seed + 500) - .5) * p.warp, wy = (noise2(u * 3 + 2, v * 3 + 9, seed + 600) - .5) * p.warp, qx = u * p.scale + wx, qy = v * p.scale + wy;
                const f = fbm(qx, qy, seed, p.octaves, p.roughness, 2.03, 0), r = fbm(qx, qy, seed, p.octaves, p.roughness, 2.03, 1);
                const rad = Math.hypot(px, py);
                switch (op) {
                    case 1:
                        value = (.055 + (1 - smoothstep(.02, 1.3, Math.hypot(px * .85, py * .94))) * (.10 + Math.pow(r, 1.65) * 1.10)) * p.height;
                        break;
                    case 2:
                        value = fbm(qx, qy, seed, p.octaves, p.roughness, 2.03, p.mode) * p.height;
                        break;
                    case 3:
                        value = Math.pow(Math.max(0, 1 - Math.pow(rad / p.radius, p.falloff)), 1.15) * (.16 + Math.pow(r, 1.6) * .94) * p.height;
                        break;
                    case 4: {
                        const rr = rad + (f - .5) * .045;
                        const cone = Math.pow(Math.max(0, 1 - rr / 1.12), 1.3), bowl = 1 - smoothstep(p.crater * .3, p.crater, rr);
                        value = (cone * (.83 + r * .23) - bowl * .62 + Math.exp(-Math.pow((rr - p.crater) / (.15 / p.rim), 2)) * .075) * p.height;
                        break;
                    }
                    case 5: {
                        const angle = p.angle * Math.PI / 180, d = u * Math.cos(angle) + v * Math.sin(angle);
                        value = (.12 + Math.pow(.5 + .5 * Math.sin(d * p.scale * 12 + f * 3), p.sharpness) * .55 + (r - .5) * .045) * p.height;
                        break;
                    }
                    case 6: {
                        const center = Math.sin(px * 3.4 + f * 1.1) * .26 + (f - .5) * .16, channel = 1 - smoothstep(p.width * .25, p.width, Math.abs(py - center));
                        value = (.70 + f * .17 - channel * p.depth * .7 + (r - .5) * .08) * p.height;
                        break;
                    }
                    case 7: {
                        const d = rad / p.radius, bowl = 1 - smoothstep(.3, .95, d), rim = Math.exp(-Math.pow((d - 1) / .14, 2)) * p.rim;
                        value = (.34 + f * .10 - bowl * .30 + rim) * p.height;
                        break;
                    }
                    case 8: {
                        const c = cellular(qx, qy, seed);
                        value = clamp(p.mode === 0 ? c[0] : c[1] - c[0]) * p.height;
                        break;
                    }
                    case 9: {
                        const angle = p.angle * Math.PI / 180, d = px * Math.cos(angle) + py * Math.sin(angle) + (f - .5) * .45;
                        value = (.06 + Math.exp(-Math.pow(d / p.width, 2)) * (.15 + Math.pow(r, 1.5) * .82)) * p.height;
                        break;
                    }
                }
            }
            else
                switch (op) {
                    case 10: {
                        const angle = p.angle * Math.PI / 180;
                        value = clamp((p.radial === 1 ? 1 - Math.hypot(px, py) : p.radial === 2 ? 1 - Math.max(Math.abs(px), Math.abs(py)) : .5 + (px * Math.cos(angle) + py * Math.sin(angle)) * .5) * p.contrast + p.offset);
                        break;
                    }
                    case 11:
                        value = p.value;
                        break;
                    case 12: {
                        const g = A ? gradient(A, n, x, y) : [0, 0], slope = Math.hypot(...g) / ratio, amount = smoothstep(p.line - p.softness, p.line + p.softness, a) * (1 - smoothstep(.1, p.slope, slope)) * p.amount * m;
                        value = a + amount;
                        maps.snow.data[i] = amount;
                        break;
                    }
                    case 13: {
                        let z = lerp(a, b, p.mix);
                        if (p.mode === 1)
                            z = a + b;
                        else if (p.mode === 2)
                            z = a * b;
                        else if (p.mode === 3)
                            z = Math.max(a, b);
                        else if (p.mode === 4)
                            z = Math.min(a, b);
                        else if (p.mode === 5)
                            z = a - b;
                        else if (p.mode === 6)
                            z = 1 - (1 - a) * (1 - b);
                        else if (p.mode === 7)
                            z = Math.abs(a - b);
                        value = p.mode === 0 ? z : lerp(a, z, p.mix);
                        break;
                    }
                    case 14: {
                        const dx = B ? (b - .5) : noise2(u * p.scale, v * p.scale, p.seed) - .5, dy = B ? sample(B, n, y, x) - .5 : noise2(u * p.scale + 23, v * p.scale + 17, p.seed + 9) - .5;
                        value = A ? sample(A, n, x + dx * p.strength * n, y + dy * p.strength * n) : 0;
                        break;
                    }
                    case 15: {
                        const t = a * p.steps + p.offset, base = Math.floor(t), f = t - base;
                        value = (base + smoothstep(.5 - p.softness * .5, .5 + p.softness * .5, f) - p.offset) / p.steps;
                        break;
                    }
                    case 16:
                        value = lerp(p.outLow, p.outHigh, Math.pow(clamp((a - p.low) / Math.max(.0001, p.high - p.low)), 1 / p.gamma));
                        break;
                    case 17:
                        value = clamp(a, Math.min(p.low, p.high), Math.max(p.low, p.high));
                        break;
                    case 18:
                        value = 1 - a;
                        break;
                    case 19: {
                        let sum = 0, count = 0;
                        for (let dy = -p.radius; dy <= p.radius; dy++)
                            for (let dx = -p.radius; dx <= p.radius; dx++) {
                                sum += A ? sample(A, n, x + dx, y + dy) : 0;
                                count++;
                            }
                        value = sum / count;
                        break;
                    }
                    case 20:
                        value = clamp(a + (a - (A ? (sample(A, n, x - 1, y) + sample(A, n, x + 1, y) + sample(A, n, x, y - 1) + sample(A, n, x, y + 1)) / 4 : 0)) * p.strength);
                        break;
                    case 21: {
                        const angle = p.angle * Math.PI / 180, xx = (u - .5 - p.x) / p.scale, yy = (v - .5 - p.y) / p.scale;
                        value = A ? sample(A, n, (xx * Math.cos(angle) - yy * Math.sin(angle) + .5) * (n - 1), (xx * Math.sin(angle) + yy * Math.cos(angle) + .5) * (n - 1)) : 0;
                        break;
                    }
                    case 22:
                        value = Math.pow(Math.max(0, a), p.exponent);
                        break;
                    case 23:
                        value = Math.abs(a - p.center) * p.gain;
                        break;
                    case 24: {
                        const g = A ? gradient(A, n, x, y) : [0, 0], angle = Math.atan(Math.hypot(...g) / ratio) * 180 / Math.PI;
                        value = smoothstep(p.low, Math.max(p.low + .01, p.high), angle);
                        break;
                    }
                    case 25:
                        value = smoothstep(p.low - p.softness, p.low + p.softness, a) * (1 - smoothstep(p.high - p.softness, p.high + p.softness, a));
                        break;
                    case 26: {
                        const lap = (A ? (sample(A, n, x - 1, y) + sample(A, n, x + 1, y) + sample(A, n, x, y - 1) + sample(A, n, x, y + 1)) : 0) - 4 * a, z = lap * n * p.strength;
                        value = p.mode === 0 ? clamp(.5 + z) : p.mode === 1 ? clamp(-z) : clamp(z);
                        break;
                    }
                    case 27: {
                        const g = A ? gradient(A, n, x, y) : [0, 0], angle = Math.atan2(g[1], g[0]), d = Math.acos(clamp(Math.cos(angle - p.angle * Math.PI / 180), -1, 1));
                        value = 1 - smoothstep(0, p.width * Math.PI / 180, d);
                        break;
                    }
                    case 28:
                        value = Math.pow(smoothstep(0, p.width, Math.min(u, v, 1 - u, 1 - v)), p.power) * (A ? a : 1);
                        break;
                    case 29:
                    case 30: {
                        const c = colorAt(A || out, n, x, y, p, op === 30, ratio);
                        for (let k = 0; k < 3; k++)
                            colors[i * 4 + k] = M ? lerp(a, c[k], m) : c[k];
                        colors[i * 4 + 3] = 1;
                        break;
                    }
                }
            if (M && op >= 13 && op <= 23)
                value = lerp(a, value, m);
            out[i] = Number.isFinite(value) ? value : 0;
        }
    }
    if (op === 12) {
        const old = inherited(inputs.a);
        if (old.snow)
            old.snow.release();
        maps = { ...old, ...maps };
    }
    else if (op >= 12 && op <= 23 || op === 29 || op === 30)
        maps = inherited(inputs.a);
    return packet(raster(n, out), maps, colors ? raster(n, colors, 4) : null);
}
export async function thermalCPU(input, n, p, mask, context = {}) {
    let h = input ? input.height.data.slice() : new Float32Array(n * n), next = new Float32Array(n * n), f = new Float32Array(n * n * 4);
    const threshold = Math.tan(p.talus * Math.PI / 180) * ((context.worldSize || 4000) / (context.elevation || 1800)) / (n - 1);
    for (let it = 0; it < p.iterations; it++) {
        throwIfAborted(context.signal);
        if (it % 8 === 0) {
            context.onStep?.(it / p.iterations);
            await new Promise(resolve => setTimeout(resolve, 0));
            throwIfAborted(context.signal);
        }
        f.fill(0);
        for (let y = 0; y < n; y++)
            for (let x = 0; x < n; x++) {
                const i = y * n + x;
                let sum = 0, max = 0;
                for (let d = 0; d < 4; d++) {
                    const xx = x + DIR[d][0], yy = y + DIR[d][1];
                    if (xx < 0 || xx >= n || yy < 0 || yy >= n)
                        continue;
                    const diff = Math.max(0, h[i] - h[yy * n + xx] - threshold);
                    f[i * 4 + d] = diff;
                    sum += diff;
                    max = Math.max(max, diff);
                }
                const amount = Math.min(Math.max(0, h[i]), max * .24 * p.rate * (mask ? clamp(mask[i]) : 1));
                if (sum > 0)
                    for (let d = 0; d < 4; d++)
                        f[i * 4 + d] = f[i * 4 + d] / sum * amount;
            }
        for (let y = 0; y < n; y++)
            for (let x = 0; x < n; x++) {
                const i = y * n + x;
                let value = h[i];
                for (let d = 0; d < 4; d++) {
                    value -= f[i * 4 + d];
                    const xx = x + DIR[d][0], yy = y + DIR[d][1];
                    if (xx >= 0 && xx < n && yy >= 0 && yy < n)
                        value += f[(yy * n + xx) * 4 + OPP[d]];
                }
                next[i] = value;
            }
        [h, next] = [next, h];
    }
    return packet(raster(n, h), inherited(input));
}
/** Closed-boundary finite-volume water/sediment model. No in-place neighbor writes. */
export async function hydraulicCPU(input, n, p, mask, context = {}) {
    const count = n * n;
    let state = new Float32Array(count * 4), next = new Float32Array(count * 4);
    const f = new Float32Array(count * 4), wear = new Float32Array(count), deposit = new Float32Array(count);
    for (let i = 0; i < count; i++)
        state[i * 4] = input?.height.data[i] || 0;
    for (let it = 0; it < p.iterations; it++) {
        throwIfAborted(context.signal);
        if (it % 8 === 0) {
            context.onStep?.(it / p.iterations);
            await new Promise(resolve => setTimeout(resolve, 0));
            throwIfAborted(context.signal);
        }
        f.fill(0);
        for (let y = 0; y < n; y++)
            for (let x = 0; x < n; x++) {
                const i = y * n + x, k = i * 4, w = state[k + 1] + p.rain * (mask ? clamp(mask[i]) : 1), level = state[k] + w;
                let total = 0;
                for (let d = 0; d < 4; d++) {
                    const xx = x + DIR[d][0], yy = y + DIR[d][1];
                    if (xx < 0 || xx >= n || yy < 0 || yy >= n)
                        continue;
                    const j = yy * n + xx, l = j * 4, neighbor = state[l] + state[l + 1] + p.rain * (mask ? clamp(mask[j]) : 1);
                    const flux = Math.max(0, (level - neighbor) * p.flowRate);
                    f[k + d] = flux;
                    total += flux;
                }
                const scale = Math.min(1, w / Math.max(total, 1e-9));
                for (let d = 0; d < 4; d++)
                    f[k + d] *= scale;
            }
        for (let y = 0; y < n; y++)
            for (let x = 0; x < n; x++) {
                const i = y * n + x, k = i * 4, w = state[k + 1] + p.rain * (mask ? clamp(mask[i]) : 1);
                let fout = 0, fin = 0, sin = 0, slope = 0;
                for (let d = 0; d < 4; d++) {
                    fout += f[k + d];
                    const xx = x + DIR[d][0], yy = y + DIR[d][1];
                    if (xx < 0 || xx >= n || yy < 0 || yy >= n)
                        continue;
                    const j = yy * n + xx, l = j * 4, incoming = f[l + OPP[d]], nw = state[l + 1] + p.rain * (mask ? clamp(mask[j]) : 1);
                    fin += incoming;
                    sin += incoming * state[l + 2] / Math.max(nw, 1e-9);
                    slope = Math.max(slope, state[k] - state[l]);
                }
                let s = Math.max(0, state[k + 2] * (1 - Math.min(1, fout / Math.max(w, 1e-9))) + sin), h = state[k];
                const speed = (fout + fin) / Math.max(w + fin, 1e-6), cap = Math.max(.0001, slope * n / 256) * speed * p.capacity * .2;
                if (s < cap) {
                    const e = Math.min(Math.max(0, h), Math.min(.02, (cap - s) * p.erosion));
                    h -= e;
                    s += e;
                    wear[i] += e;
                }
                else {
                    const d = Math.min(s, (s - cap) * p.deposition);
                    h += d;
                    s -= d;
                    deposit[i] += d;
                }
                next[k] = h;
                next[k + 1] = Math.max(0, w + fin - fout) * (1 - p.evaporation);
                next[k + 2] = s;
                next[k + 3] = state[k + 3] + (fin + fout) * .5;
            }
        [state, next] = [next, state];
    }
    const height = new Float32Array(count), flow = new Float32Array(count), water = new Float32Array(count);
    for (let i = 0; i < count; i++) {
        height[i] = state[i * 4] + state[i * 4 + 2];
        deposit[i] += state[i * 4 + 2];
        water[i] = state[i * 4 + 1];
        flow[i] = state[i * 4 + 3];
    }
    return packet(raster(n, height), { flow: raster(n, flow), wear: raster(n, wear), deposition: raster(n, deposit), water: raster(n, water) });
}
export function toPlain(result) { return { size: result.size, height: result.height.data, maps: Object.fromEntries(Object.entries(result.maps).map(([k, v]) => [k, v.data])), color: result.color?.data || null }; }
export function fromPlain(p) { return packet(raster(p.size, p.height), Object.fromEntries(Object.entries(p.maps || {}).map(([k, v]) => [k, raster(p.size, v)])), p.color ? raster(p.size, p.color, 4) : null); }
export class CpuBackend {
    constructor({ workerURL = null } = {}) { this.kind = 'CPU'; this.workerURL = workerURL; this.worker = null; this.nextID = 0; }
    async run(node, inputs, n, context = {}) {
        if (!this.workerURL)
            return runCPU(node, inputs, n, context);
        if (!this.worker) {
            try {
                this.worker = new Worker(this.workerURL, { type: 'module' });
            }
            catch (error) {
                this.workerURL = null;
                this.workerFailure = error.message;
                return runCPU(node, inputs, n, context);
            }
        }
        const worker = this.worker, id = ++this.nextID;
        return new Promise((resolve, reject) => {
            const cleanup = () => { worker.removeEventListener('message', onMessage); worker.removeEventListener('error', onError); context.signal?.removeEventListener('abort', onAbort); };
            const onAbort = () => { cleanup(); worker.terminate(); this.worker = null; reject(new DOMException('Build cancelled', 'AbortError')); };
            const onError = e => { cleanup(); worker.terminate(); this.worker = null; this.workerURL = null; this.workerFailure = e.message || 'Worker transport is unavailable'; runCPU(node, inputs, n, context).then(resolve, reject); };
            const onMessage = e => { if (e.data.id !== id)
                return; cleanup(); if (e.data.error)
                reject(new Error(e.data.error));
            else
                resolve(fromPlain(e.data.result)); };
            worker.addEventListener('message', onMessage);
            worker.addEventListener('error', onError);
            context.signal?.addEventListener('abort', onAbort, { once: true });
            if (context.signal?.aborted) {
                onAbort();
                return;
            }
            worker.postMessage({ id, node, inputs: Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, toPlain(v)])), n, context: { worldSize: context.worldSize, elevation: context.elevation } });
        });
    }
    async read(result) { return toPlain(result); }
    async readRaster(raster) { return raster.data; }
    dispose() { this.worker?.terminate(); this.worker = null; }
}
