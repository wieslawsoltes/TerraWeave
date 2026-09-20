import { clamp, sample } from '../../math/src/index.js';
const encoder = new TextEncoder(), decoder = new TextDecoder();
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++)
    c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
export function crc32(bytes) { let c = 0xffffffff; for (const b of bytes)
    c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
export function concat(...arrays) { const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0)); let offset = 0; for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
} return out; }
function chunk(type, data) { const out = new Uint8Array(data.length + 12), view = new DataView(out.buffer); view.setUint32(0, data.length); out.set(encoder.encode(type), 4); out.set(data, 8); view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length))); return out; }
function zlibStored(raw) { let a = 1, b = 0; for (const value of raw) {
    a = (a + value) % 65521;
    b = (b + a) % 65521;
} const parts = [new Uint8Array([0x78, 0x01])]; for (let p = 0; p < raw.length; p += 65535) {
    const n = Math.min(65535, raw.length - p);
    parts.push(new Uint8Array([p + n === raw.length ? 1 : 0, n & 255, n >>> 8, (~n) & 255, ((~n) >>> 8) & 255]), raw.subarray(p, p + n));
} const end = new Uint8Array(4); new DataView(end.buffer).setUint32(0, ((b << 16) | a) >>> 0); parts.push(end); return concat(...parts); }
async function deflate(raw) { if (typeof CompressionStream === 'undefined')
    return zlibStored(raw); return new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer()); }
/** Lossless, grayscale 16-bit PNG. Samples are encoded big-endian as required by PNG. */
export async function encodePNG16(data, n, { min = 0, max = 1 } = {}) { if (data.length !== n * n)
    throw new Error('PNG dimensions do not match samples'); const raw = new Uint8Array(n * (n * 2 + 1)); for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
        const value = Math.round(clamp((data[y * n + x] - min) / (max - min || 1)) * 65535), offset = y * (n * 2 + 1) + 1 + x * 2;
        raw[offset] = value >>> 8;
        raw[offset + 1] = value & 255;
    } return png(n, n, 16, 0, raw); }
export async function encodePNG8(data, width, height = width, channels = 4) { if (data.length !== width * height * channels || ![1, 3, 4].includes(channels))
    throw new Error('Invalid PNG buffer'); const raw = new Uint8Array(height * (width * channels + 1)); for (let y = 0; y < height; y++)
    raw.set(data.subarray(y * width * channels, (y + 1) * width * channels), y * (width * channels + 1) + 1); return png(width, height, 8, channels === 1 ? 0 : channels === 3 ? 2 : 6, raw); }
async function png(width, height, depth, colorType, raw) { const ihdr = new Uint8Array(13), view = new DataView(ihdr.buffer); view.setUint32(0, width); view.setUint32(4, height); ihdr[8] = depth; ihdr[9] = colorType; return concat(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', await deflate(raw)), chunk('IEND', new Uint8Array())); }
export function raw16(data) { const out = new Uint8Array(data.length * 2), v = new DataView(out.buffer); for (let i = 0; i < data.length; i++)
    v.setUint16(i * 2, Math.round(clamp(data[i]) * 65535), true); return out; }
export function raw32(data) { const out = new Uint8Array(data.length * 4), v = new DataView(out.buffer); for (let i = 0; i < data.length; i++)
    v.setFloat32(i * 4, data[i], true); return out; }
const cstr = s => concat(encoder.encode(s), new Uint8Array([0]));
const i32 = (...nums) => { const b = new Uint8Array(nums.length * 4), v = new DataView(b.buffer); nums.forEach((n, i) => v.setInt32(i * 4, n, true)); return b; };
const f32 = (...nums) => { const b = new Uint8Array(nums.length * 4), v = new DataView(b.buffer); nums.forEach((n, i) => v.setFloat32(i * 4, n, true)); return b; };
function attribute(name, type, data) { return concat(cstr(name), cstr(type), i32(data.length), data); }
/** Standards-compliant, uncompressed OpenEXR scanline image with one FLOAT channel named Y. */
export function encodeEXR(data, n) { const ch = concat(cstr('Y'), i32(2), new Uint8Array(4), i32(1, 1), new Uint8Array([0])); const header = concat(i32(20000630, 2), attribute('channels', 'chlist', ch), attribute('compression', 'compression', new Uint8Array([0])), attribute('dataWindow', 'box2i', i32(0, 0, n - 1, n - 1)), attribute('displayWindow', 'box2i', i32(0, 0, n - 1, n - 1)), attribute('lineOrder', 'lineOrder', new Uint8Array([0])), attribute('pixelAspectRatio', 'float', f32(1)), attribute('screenWindowCenter', 'v2f', f32(0, 0)), attribute('screenWindowWidth', 'float', f32(1)), new Uint8Array([0])); const table = new Uint8Array(n * 8), tv = new DataView(table.buffer), rows = []; let offset = header.length + table.length; for (let y = 0; y < n; y++) {
    tv.setBigUint64(y * 8, BigInt(offset), true);
    const row = concat(i32(y, n * 4), raw32(data.subarray(y * n, (y + 1) * n)));
    rows.push(row);
    offset += row.length;
} return concat(header, table, ...rows); }
export function normalMap(data, n, worldSize = 4000, elevation = 1800, flipGreen = false) { const rgba = new Uint8Array(n * n * 4), scale = elevation / worldSize * (n - 1) * .5; for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
        let nx = -(sample(data, n, x + 1, y) - sample(data, n, x - 1, y)) * scale, ny = -(sample(data, n, x, y + 1) - sample(data, n, x, y - 1)) * scale;
        const norm = Math.hypot(nx, ny, 1), i = (y * n + x) * 4;
        rgba[i] = Math.round((nx / norm * .5 + .5) * 255);
        rgba[i + 1] = Math.round((ny / norm * (flipGreen ? -.5 : .5) + .5) * 255);
        rgba[i + 2] = Math.round((1 / norm * .5 + .5) * 255);
        rgba[i + 3] = 255;
    } return rgba; }
export function colorMap(snapshot) { const n = snapshot.size, rgba = new Uint8Array(n * n * 4); for (let i = 0; i < n * n; i++) {
    for (let c = 0; c < 3; c++)
        rgba[i * 4 + c] = Math.round(Math.pow(clamp(snapshot.color ? snapshot.color[i * 4 + c] : snapshot.height[i]), 1 / 2.2) * 255);
    rgba[i * 4 + 3] = 255;
} return rgba; }
export function splatMap(data, n, worldSize = 4000, elevation = 1800, { waterLevel = .08, snowLine = .6 } = {}) { const out = new Uint8Array(n * n * 4), scale = elevation / worldSize * (n - 1) * .5; for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
        const i = y * n + x, h = data[i], sl = Math.hypot((sample(data, n, x + 1, y) - sample(data, n, x - 1, y)) * scale, (sample(data, n, x, y + 1) - sample(data, n, x, y - 1)) * scale);
        const sand = clamp((waterLevel + .08 - h) / .12), snow = clamp((h - snowLine + .03) / .12) * (1 - clamp(sl / 2)), rock = clamp(sl / 1.2) * (1 - snow), grass = Math.max(0, 1 - sand - snow - rock), sum = sand + grass + rock + snow || 1;
        let total = 0;
        [sand, grass, rock].forEach((v, k) => { out[i * 4 + k] = Math.floor(v / sum * 255); total += out[i * 4 + k]; });
        out[i * 4 + 3] = 255 - total;
    } return out; }
export function meshData(snapshot, { worldSize = 4000, elevation = 1800, segments = 256 } = {}) { const n = snapshot.size, s = Math.min(segments, n - 1), m = s + 1, positions = new Float32Array(m * m * 3), normals = new Float32Array(m * m * 3), uvs = new Float32Array(m * m * 2), colors = new Float32Array(m * m * 4), indices = new Uint32Array(s * s * 6), min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]; for (let y = 0; y < m; y++)
    for (let x = 0; x < m; x++) {
        const i = y * m + x, u = x / s, v = y / s, xx = u * (n - 1), yy = v * (n - 1), h = sample(snapshot.height, n, xx, yy);
        const p = [(u - .5) * worldSize, h * elevation, (v - .5) * worldSize];
        positions.set(p, i * 3);
        p.forEach((value, k) => { min[k] = Math.min(min[k], value); max[k] = Math.max(max[k], value); });
        let dx = (sample(snapshot.height, n, xx + 1, yy) - sample(snapshot.height, n, xx - 1, yy)) * elevation / worldSize * (n - 1) * .5, dy = (sample(snapshot.height, n, xx, yy + 1) - sample(snapshot.height, n, xx, yy - 1)) * elevation / worldSize * (n - 1) * .5;
        const l = Math.hypot(dx, dy, 1);
        normals.set([-dx / l, 1 / l, -dy / l], i * 3);
        uvs.set([u, v], i * 2);
        const si = (Math.round(yy) * n + Math.round(xx)) * 4;
        colors.set(snapshot.color ? snapshot.color.subarray(si, si + 4) : [h, h, h, 1], i * 4);
    } for (let y = 0; y < s; y++)
    for (let x = 0; x < s; x++) {
        const a = y * m + x, b = a + 1, c = a + m, d = c + 1;
        indices.set([a, c, b, b, c, d], (y * s + x) * 6);
    } return { positions, normals, uvs, colors, indices, min, max, segments: s }; }
export function encodeOBJ(snapshot, options = {}) { const m = meshData(snapshot, options), out = ['# TerraWeave heightfield mesh. Units: meters. +Y up.', 'o TerraWeaveTerrain']; for (let i = 0; i < m.positions.length; i += 3)
    out.push(`v ${m.positions[i].toFixed(5)} ${m.positions[i + 1].toFixed(5)} ${m.positions[i + 2].toFixed(5)}`); for (let i = 0; i < m.uvs.length; i += 2)
    out.push(`vt ${m.uvs[i].toFixed(6)} ${m.uvs[i + 1].toFixed(6)}`); for (let i = 0; i < m.normals.length; i += 3)
    out.push(`vn ${m.normals[i].toFixed(6)} ${m.normals[i + 1].toFixed(6)} ${m.normals[i + 2].toFixed(6)}`); for (let i = 0; i < m.indices.length; i += 3) {
    const a = m.indices[i] + 1, b = m.indices[i + 1] + 1, c = m.indices[i + 2] + 1;
    out.push(`f ${a}/${a}/${a} ${b}/${b}/${b} ${c}/${c}/${c}`);
} return encoder.encode(out.join('\n') + '\n'); }
export function encodeGLB(snapshot, options = {}) { const m = meshData(snapshot, options), arrays = [m.positions, m.normals, m.uvs, m.colors, m.indices], views = []; let length = 0; for (let i = 0; i < arrays.length; i++) {
    views.push({ buffer: 0, byteOffset: length, byteLength: arrays[i].byteLength, target: i === 4 ? 34963 : 34962 });
    length += arrays[i].byteLength;
} const bin = concat(...arrays.map(a => new Uint8Array(a.buffer, a.byteOffset, a.byteLength))); const count = m.positions.length / 3, doc = { asset: { version: '2.0', generator: 'TerraWeave' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: 'TerraWeave terrain' }], meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2, COLOR_0: 3 }, indices: 4, material: 0 }] }], materials: [{ name: 'Terrain surface', pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: .94 } }], buffers: [{ byteLength: bin.length }], bufferViews: views, accessors: [{ bufferView: 0, componentType: 5126, count, type: 'VEC3', min: m.min, max: m.max }, { bufferView: 1, componentType: 5126, count, type: 'VEC3' }, { bufferView: 2, componentType: 5126, count, type: 'VEC2' }, { bufferView: 3, componentType: 5126, count, type: 'VEC4' }, { bufferView: 4, componentType: 5125, count: m.indices.length, type: 'SCALAR' }] }; const json = encoder.encode(JSON.stringify(doc)), jp = new Uint8Array(Math.ceil(json.length / 4) * 4); jp.fill(32); jp.set(json); const header = i32(0x46546c67, 2, 12 + 8 + jp.length + 8 + bin.length); return concat(header, i32(jp.length, 0x4e4f534a), jp, i32(bin.length, 0x004e4942), bin); }
/** ZIP32 STORE writer; UTF-8 paths, per-file CRC32, deterministic timestamps. */
export function encodeZIP(files) { const locals = [], central = []; let offset = 0; for (const [name, content] of Object.entries(files)) {
    if (name.includes('..') || name.startsWith('/') || name.includes('\\'))
        throw new Error('Unsafe ZIP path');
    const path = encoder.encode(name), data = typeof content === 'string' ? encoder.encode(content) : content, crc = crc32(data);
    if (data.length > 0xffffffff)
        throw new Error('ZIP64 is not supported');
    const h = new Uint8Array(30), v = new DataView(h.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, 0x800, true);
    v.setUint16(12, 33, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, data.length, true);
    v.setUint32(22, data.length, true);
    v.setUint16(26, path.length, true);
    locals.push(h, path, data);
    const c = new Uint8Array(46), cv = new DataView(c.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x800, true);
    cv.setUint16(14, 33, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, path.length, true);
    cv.setUint32(42, offset, true);
    central.push(c, path);
    offset += 30 + path.length + data.length;
} const cdata = concat(...central), end = new Uint8Array(22), e = new DataView(end.buffer), count = Object.keys(files).length; e.setUint32(0, 0x06054b50, true); e.setUint16(8, count, true); e.setUint16(10, count, true); e.setUint32(12, cdata.length, true); e.setUint32(16, offset, true); return concat(...locals, cdata, end); }
export async function exportBundle(snapshot, project) { const n = snapshot.size, files = { 'project.terraweave.json': JSON.stringify(project, null, 2), 'height.png': await encodePNG16(snapshot.height, n), 'height.r32': raw32(snapshot.height), 'normals.png': await encodePNG8(normalMap(snapshot.height, n, project.worldSize, project.elevation), n), 'albedo.png': await encodePNG8(colorMap(snapshot), n), 'splat.png': await encodePNG8(splatMap(snapshot.height, n, project.worldSize, project.elevation, project.view), n), 'metadata.json': JSON.stringify({ generator: 'TerraWeave', resolution: n, worldSizeMeters: project.worldSize, elevationMeters: project.elevation, orientation: { up: '+Y', imageU: '+X', imageV: '+Z', origin: 'top-left' }, raw: { format: 'float32', endianness: 'little', nominalRange: [0, 1], clipped: false }, normalMap: { r: 'tangent +X', g: 'tangent +Z (image V down)', b: 'up' }, splat: ['sand', 'grass', 'rock', 'snow'], masksNormalizedForPNG: true }, null, 2) }; for (const [k, data] of Object.entries(snapshot.maps)) {
    let min = Infinity, max = -Infinity;
    for (const v of data) {
        min = Math.min(min, v);
        max = Math.max(max, v);
    }
    files[`masks/${k}.png`] = await encodePNG16(data, n, { min: Math.min(0, min), max: Math.max(1e-8, max) });
    files[`masks/${k}.r32`] = raw32(data);
} return encodeZIP(files); }
export async function decodePNGHeight(bytes) {
    if (bytes[0] !== 137 || decoder.decode(bytes.subarray(1, 4)) !== 'PNG')
        throw new Error('Not a PNG');
    let p = 8, width, height, depth, color, interlace, parts = [];
    while (p + 12 <= bytes.length) {
        const v = new DataView(bytes.buffer, bytes.byteOffset + p), len = v.getUint32(0);
        if (len > bytes.length - p - 12)
            throw new Error('Truncated PNG');
        const type = decoder.decode(bytes.subarray(p + 4, p + 8)), data = bytes.subarray(p + 8, p + 8 + len);
        if (crc32(bytes.subarray(p + 4, p + 8 + len)) !== v.getUint32(8 + len))
            throw new Error('PNG checksum mismatch');
        if (type === 'IHDR') {
            const h = new DataView(data.buffer, data.byteOffset);
            width = h.getUint32(0);
            height = h.getUint32(4);
            depth = data[8];
            color = data[9];
            interlace = data[12];
        }
        if (type === 'IDAT')
            parts.push(data);
        p += len + 12;
        if (type === 'IEND')
            break;
    }
    if (width !== height || width < 2 || width > 2048)
        throw new Error('Heightfields must be square and 2–2048 pixels');
    if (![8, 16].includes(depth) || ![0, 2, 4, 6].includes(color) || interlace !== 0)
        throw new Error('This PNG layout requires 8-bit browser decoding');
    if (typeof DecompressionStream === 'undefined')
        throw new Error('PNG decompression is not supported');
    const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[color], bpp = channels * (depth / 8), stride = width * bpp, raw = new Uint8Array(await new Response(new Blob([concat(...parts)]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
    if (raw.length !== (stride + 1) * height)
        throw new Error('Invalid PNG decompressed size');
    const decoded = new Uint8Array(stride * height);
    const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
    for (let y = 0; y < height; y++) {
        const filter = raw[y * (stride + 1)];
        if (filter > 4)
            throw new Error('Unsupported PNG filter');
        for (let x = 0; x < stride; x++) {
            const i = y * stride + x, a = x >= bpp ? decoded[i - bpp] : 0, b = y ? decoded[i - stride] : 0, c = y && x >= bpp ? decoded[i - stride - bpp] : 0, value = raw[y * (stride + 1) + 1 + x];
            decoded[i] = (value + (filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? Math.floor((a + b) / 2) : paeth(a, b, c))) & 255;
        }
    }
    const data = new Float32Array(width * height), v = new DataView(decoded.buffer);
    for (let i = 0; i < data.length; i++) {
        const at = i * bpp;
        const read = c => depth === 16 ? v.getUint16(at + c * 2) / 65535 : decoded[at + c] / 255;
        data[i] = color === 0 || color === 4 ? read(0) : read(0) * .2126 + read(1) * .7152 + read(2) * .0722;
    }
    return { size: width, data, precision: depth };
}
export function decodeRaw(bytes, { bits = 16, size = null, littleEndian = true } = {}) { const count = bytes.byteLength / (bits / 8), n = size || Math.sqrt(count); if (!Number.isInteger(n) || n < 2 || n > 2048 || n * n !== count)
    throw new Error('RAW must contain a square heightfield (2–2048 samples per side)'); const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), data = new Float32Array(count); for (let i = 0; i < count; i++) {
    const value = bits === 16 ? v.getUint16(i * 2, littleEndian) / 65535 : v.getFloat32(i * 4, littleEndian);
    if (!Number.isFinite(value))
        throw new Error('RAW contains non-finite values');
    data[i] = value;
} return { size: n, data, precision: bits }; }
export async function importImage(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength > 64 * 1024 * 1024)
        throw new Error('Input exceeds 64 MiB');
    if (/\.(r32|f32)$/i.test(file.name))
        return decodeRaw(bytes, { bits: 32 });
    if (/\.(raw|r16)$/i.test(file.name))
        return decodeRaw(bytes, { bits: 16 });
    if (/\.png$/i.test(file.name)) {
        try {
            return await decodePNGHeight(bytes);
        }
        catch (e) {
            if (!e.message.includes('browser decoding'))
                throw e;
        }
    }
    const bitmap = await createImageBitmap(file);
    try {
        const n = Math.min(1024, Math.max(bitmap.width, bitmap.height)), canvas = new OffscreenCanvas(n, n), ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0, n, n);
        const pixels = ctx.getImageData(0, 0, n, n).data, data = new Float32Array(n * n);
        for (let i = 0; i < data.length; i++)
            data[i] = (pixels[i * 4] * .2126 + pixels[i * 4 + 1] * .7152 + pixels[i * 4 + 2] * .0722) / 255;
        return { size: n, data, precision: 8 };
    }
    finally {
        bitmap.close();
    }
}
export function download(data, name, mime = 'application/octet-stream') { const blob = data instanceof Blob ? data : new Blob([data], { type: mime }), url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000); }
export class ProjectStore {
    constructor() { this.db = null; }
    async open() { if (this.db)
        return this.db; this.db = await new Promise((resolve, reject) => { const req = indexedDB.open('terraweave-projects', 1); req.onupgradeneeded = () => req.result.createObjectStore('projects'); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); return this.db; }
    async get(key = 'autosave') { const db = await this.open(); return new Promise((resolve, reject) => { const t = db.transaction('projects', 'readonly'), r = t.objectStore('projects').get(key); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); }
    async set(value, key = 'autosave') { const db = await this.open(); return new Promise((resolve, reject) => { const t = db.transaction('projects', 'readwrite'); t.objectStore('projects').put(value, key); t.oncomplete = resolve; t.onerror = () => reject(t.error); t.onabort = () => reject(t.error || new Error('Autosave transaction aborted')); }); }
    close() { this.db?.close(); this.db = null; }
}
