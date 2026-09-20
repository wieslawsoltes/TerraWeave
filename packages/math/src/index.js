/** Pure deterministic numerical primitives. No DOM, GPU or runtime dependencies. */
export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / Math.max(1e-8, b - a)); return t * t * (3 - 2 * t); };
export function hash2(x, y, seed = 1) { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041)) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
export function noise2(x, y, seed = 1) { const i = Math.floor(x), j = Math.floor(y), u = x - i, v = y - j, a = u * u * (3 - 2 * u), b = v * v * (3 - 2 * v); return lerp(lerp(hash2(i, j, seed), hash2(i + 1, j, seed), a), lerp(hash2(i, j + 1, seed), hash2(i + 1, j + 1, seed), a), b); }
export function fbm(x, y, seed = 1, octaves = 6, roughness = .5, lacunarity = 2.03, mode = 0) { let sum = 0, amp = 1, total = 0; for (let i = 0; i < octaves; i++) {
    let n = noise2(x, y, seed + i * 101);
    if (mode === 1)
        n = 1 - Math.abs(2 * n - 1);
    if (mode === 2)
        n = Math.abs(2 * n - 1);
    sum += n * amp;
    total += amp;
    x = x * lacunarity + 7.13;
    y = y * lacunarity + 3.71;
    amp *= roughness;
} return sum / Math.max(total, 1e-8); }
export function cellular(x, y, seed) { let f1 = 10, f2 = 10; const ix = Math.floor(x), iy = Math.floor(y); for (let j = -1; j <= 1; j++)
    for (let i = -1; i <= 1; i++) {
        let px = ix + i, py = iy + j;
        const dx = px + hash2(px, py, seed) - x, dy = py + hash2(px, py, seed + 31) - y, d = Math.sqrt(dx * dx + dy * dy);
        if (d < f1) {
            f2 = f1;
            f1 = d;
        }
        else if (d < f2)
            f2 = d;
    } return [f1, f2]; }
export function sample(a, n, x, y) { x = clamp(x, 0, n - 1); y = clamp(y, 0, n - 1); const ix = Math.floor(x), iy = Math.floor(y), jx = Math.min(n - 1, ix + 1), jy = Math.min(n - 1, iy + 1), u = x - ix, v = y - iy; return lerp(lerp(a[iy * n + ix], a[iy * n + jx], u), lerp(a[jy * n + ix], a[jy * n + jx], u), v); }
export function statistics(a, bins = 64) { let min = Infinity, max = -Infinity, sum = 0, sum2 = 0; for (const v of a) {
    if (!Number.isFinite(v))
        throw new Error('Non-finite field sample');
    min = Math.min(min, v);
    max = Math.max(max, v);
    sum += v;
    sum2 += v * v;
} const histogram = new Uint32Array(bins); for (const v of a)
    histogram[Math.min(bins - 1, Math.floor((v - min) / (max - min || 1) * bins))]++; return { min, max, mean: sum / a.length, std: Math.sqrt(Math.max(0, sum2 / a.length - (sum / a.length) ** 2)), histogram }; }
export function perspective(fovy, aspect, near, far, webgpu = false) { const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far); return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, webgpu ? far * nf : (far + near) * nf, -1, 0, 0, webgpu ? far * near * nf : 2 * far * near * nf, 0]); }
const normalize = v => { const l = Math.hypot(...v) || 1; return v.map(x => x / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export function lookAt(eye, target, up = [0, 1, 0]) { const z = normalize(eye.map((e, i) => e - target[i])), x = normalize(cross(up, z)), y = cross(z, x); return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1]); }
export function multiply(a, b) { const o = new Float32Array(16); for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++)
        for (let k = 0; k < 4; k++)
            o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; }
export function invert4(m) { const a = Array.from({ length: 4 }, (_, r) => Array.from({ length: 8 }, (_, c) => c < 4 ? m[c * 4 + r] : +(c - 4 === r))); for (let i = 0; i < 4; i++) {
    let p = i;
    for (let r = i + 1; r < 4; r++)
        if (Math.abs(a[r][i]) > Math.abs(a[p][i]))
            p = r;
    if (Math.abs(a[p][i]) < 1e-12)
        return null;
    [a[p], a[i]] = [a[i], a[p]];
    const d = a[i][i];
    for (let c = 0; c < 8; c++)
        a[i][c] /= d;
    for (let r = 0; r < 4; r++)
        if (r !== i) {
            const f = a[r][i];
            for (let c = 0; c < 8; c++)
                a[r][c] -= f * a[i][c];
        }
} return new Float32Array(Array.from({ length: 16 }, (_, i) => a[i % 4][4 + Math.floor(i / 4)])); }
export function transform4(m, v) { return Array.from({ length: 4 }, (_, r) => m[r] * v[0] + m[4 + r] * v[1] + m[8 + r] * v[2] + m[12 + r] * v[3]); }
