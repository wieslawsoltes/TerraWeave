import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { encodePNG16, decodePNGHeight, encodePNG8, crc32, raw16, raw32, decodeRaw, encodeEXR, meshData, encodeGLB, encodeOBJ, encodeZIP, normalMap, splatMap, colorMap, exportBundle } from '../dist/packages/io/src/index.js';
import { createPreset } from '../dist/packages/nodes/src/index.js';
const n = 8, height = Float32Array.from({ length: n * n }, (_, i) => i / (n * n - 1)), snapshot = { size: n, height, maps: { flow: height.slice() }, color: null };
test('PNG16 stores real big-endian 16-bit samples and round trips', async () => { const bytes = await encodePNG16(height, n); assert.equal(bytes[24], 16); assert.equal(bytes[25], 0); const image = await decodePNGHeight(bytes); assert.equal(image.size, n); assert.equal(image.precision, 16); for (let i = 0; i < height.length; i++)
    assert.ok(Math.abs(image.data[i] - height[i]) <= 1 / 65535); let offset = 8, raw; while (offset < bytes.length) {
    const v = new DataView(bytes.buffer, bytes.byteOffset + offset), len = v.getUint32(0), type = new TextDecoder().decode(bytes.subarray(offset + 4, offset + 8));
    if (type === 'IDAT')
        raw = inflateSync(bytes.subarray(offset + 8, offset + 8 + len));
    offset += len + 12;
} assert.equal(raw.length, n * (n * 2 + 1)); assert.equal(raw[raw.length - 1], 255); });
test('PNG corruption is detected before import', async () => { const bytes = await encodePNG16(height, n); bytes[40] ^= 1; await assert.rejects(decodePNGHeight(bytes), /CRC|corrupt|checksum/i); });
test('RGBA PNG and scalar PNG encode declared color models', async () => { const rgba = new Uint8Array(n * n * 4).fill(127), bytes = await encodePNG8(rgba, n); assert.equal(bytes[24], 8); assert.equal(bytes[25], 6); const image = await decodePNGHeight(bytes); assert.ok(Math.abs(image.data[0] - 127 / 255) < 1e-5); });
test('RAW formats have documented byte order and preserve float values', () => { const data = Float32Array.from([-.3, .1234567, 1, 2.5]); const b = raw32(data), v = new DataView(b.buffer); assert.equal(v.getFloat32(0, true), data[0]); assert.deepEqual(decodeRaw(b, { bits: 32 }).data, data); const u = raw16(data); assert.equal(new DataView(u.buffer).getUint16(0, true), 0); assert.equal(new DataView(u.buffer).getUint16(6, true), 65535); assert.throws(() => decodeRaw(new Uint8Array(17)), /square|Invalid|dimensions/i); });
test('OpenEXR has valid magic, FLOAT Y channel and scanline offsets', () => { const b = encodeEXR(height, n), v = new DataView(b.buffer); assert.equal(v.getUint32(0, true), 20000630); assert.equal(v.getUint32(4, true), 2); let p = 8; const readString = () => { const start = p; while (b[p])
    p++; return new TextDecoder().decode(b.subarray(start, p++)); }; const attrs = {}; while (b[p]) {
    const name = readString(), type = readString(), len = v.getUint32(p, true);
    p += 4;
    attrs[name] = { type, data: b.subarray(p, p + len) };
    p += len;
} p++; assert.equal(attrs.channels.data[0], 89); assert.equal(new DataView(attrs.channels.data.buffer, attrs.channels.data.byteOffset + 2).getUint32(0, true), 2); for (let y = 0; y < n; y++) {
    const off = Number(v.getBigUint64(p + y * 8, true));
    assert.equal(v.getInt32(off, true), y);
    assert.equal(v.getInt32(off + 4, true), n * 4);
    for (let x = 0; x < n; x++)
        assert.equal(v.getFloat32(off + 8 + x * 4, true), height[y * n + x]);
} });
test('terrain mesh has upward winding, unit normals, UVs and valid bounds', () => { const m = meshData(snapshot, { segments: 4, worldSize: 100, elevation: 20 }); assert.equal(m.positions.length, 25 * 3); assert.equal(m.indices.length, 4 * 4 * 6); for (let i = 0; i < m.normals.length; i += 3)
    assert.ok(Math.abs(Math.hypot(...m.normals.subarray(i, i + 3)) - 1) < 1e-5); for (let i = 0; i < m.indices.length; i += 3) {
    const [a, b, c] = m.indices.subarray(i, i + 3), ax = m.positions[b * 3] - m.positions[a * 3], az = m.positions[b * 3 + 2] - m.positions[a * 3 + 2], bx = m.positions[c * 3] - m.positions[a * 3], bz = m.positions[c * 3 + 2] - m.positions[a * 3 + 2];
    assert.ok(az * bx - ax * bz > 0);
} assert.deepEqual(m.min, [-50, 0, -50]); assert.deepEqual(m.max, [50, 20, 50]); });
test('GLB and OBJ serialize usable mesh structures', () => { const glb = encodeGLB(snapshot, { segments: 4 }), v = new DataView(glb.buffer); assert.equal(v.getUint32(0, true), 0x46546c67); assert.equal(v.getUint32(4, true), 2); assert.equal(v.getUint32(8, true), glb.length); const size = v.getUint32(12, true), doc = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + size))); assert.equal(doc.accessors[0].count, 25); assert.equal(doc.accessors[4].count, 96); assert.ok(doc.meshes[0].primitives[0].attributes.COLOR_0 === 3); const obj = new TextDecoder().decode(encodeOBJ(snapshot, { segments: 4 })); assert.equal(obj.split('\n').filter(l => l.startsWith('f ')).length, 32); });
test('ZIP files include valid CRC and reject unsafe paths', () => { const data = new TextEncoder().encode('terrain'), zip = encodeZIP({ 'test.txt': data }), v = new DataView(zip.buffer); assert.equal(v.getUint32(0, true), 0x04034b50); assert.equal(v.getUint32(14, true), crc32(data)); assert.equal(v.getUint32(zip.length - 22, true), 0x06054b50); assert.throws(() => encodeZIP({ '../bad': data }), /Unsafe/); });
test('normal maps and splat weights encode geometric meaning', () => { const flat = new Float32Array(n * n).fill(.3), normal = normalMap(flat, n), splat = splatMap(height, n); assert.deepEqual(Array.from(normal.subarray(0, 4)), [128, 128, 255, 255]); for (let i = 0; i < n * n; i++)
    assert.equal(splat[i * 4] + splat[i * 4 + 1] + splat[i * 4 + 2] + splat[i * 4 + 3], 255); assert.equal(colorMap(snapshot).length, n * n * 4); });
test('asset bundle is a complete ZIP with simulation maps', async () => { const zip = await exportBundle(snapshot, createPreset()), text = new TextDecoder().decode(zip); for (const name of ['project.terraweave.json', 'height.png', 'height.r32', 'normals.png', 'albedo.png', 'splat.png', 'metadata.json', 'masks/flow.png', 'masks/flow.r32'])
    assert.ok(text.includes(name), name); });
