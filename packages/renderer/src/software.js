import { sample, clamp, transform4 } from '@terraweave/math';
/** Emergency CPU rasterizer. Same heightfields, real projected triangles and per-pixel depth.
 * This intentionally favors broad compatibility over interactive GPU performance.
 */
export function drawSoftware(renderer) {
    const canvas = renderer.canvas, ctx = renderer.context2d, s = renderer.settings;
    const rect = canvas.getBoundingClientRect(), factor = Math.min(1, 1000 / Math.max(rect.width, rect.height));
    const w = Math.max(1, Math.round(rect.width * factor)), h = Math.max(1, Math.round(rect.height * factor));
    if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
    }
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#29363e');
    bg.addColorStop(1, '#141c23');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    const p = renderer.snapshot;
    if (!renderer.held || !p)
        return;
    const n = p.size, data = p.height, colors = p.color, m = renderer.camera.matrix(w / h, false), nseg = Math.min(128, n - 1), stride = nseg + 1;
    const az = s.sunAzimuth * Math.PI / 180, alt = s.sunAltitude * Math.PI / 180, light = [Math.cos(az) * Math.cos(alt), Math.sin(alt), Math.sin(az) * Math.cos(alt)];
    const project = (x, y, z) => { const v = transform4(m, [x, y, z, 1]), q = 1 / v[3]; return [(v[0] * q * .5 + .5) * w, (.5 - v[1] * q * .5) * h, v[2] * q, q]; };
    const tone = c => { const x = Math.max(0, c * s.exposure); return Math.pow(clamp(x * (2.51 * x + .03) / (x * (2.43 * x + .59) + .14)), 1 / 2.2) * 255; };
    const height = (u, v) => sample(data, n, u * (n - 1), v * (n - 1));
    const normal = (u, v) => { const x = u * (n - 1), y = v * (n - 1), dx = (sample(data, n, x - 1, y) - sample(data, n, x + 1, y)) * s.heightScale, dy = (sample(data, n, x, y - 1) - sample(data, n, x, y + 1)) * s.heightScale, up = 4 / (n - 1), l = Math.hypot(dx, up, dy); return [dx / l, up / l, dy / l]; };
    const color = (u, v, value) => { if (!colors)
        return [.12 + value * .4, .19 + value * .35, .14 + value * .32]; const i = (Math.round(v * (n - 1)) * n + Math.round(u * (n - 1))) * 4; return [colors[i], colors[i + 1], colors[i + 2]]; };
    if (s.flat) {
        const side = Math.min(w, h) * .86, x0 = Math.round((w - side) / 2), y0 = Math.round((h - side) / 2), size = Math.max(1, Math.round(side)), img = ctx.createImageData(size, size);
        for (let y = 0; y < size; y++)
            for (let x = 0; x < size; x++) {
                const u = x / (size - 1), v = y / (size - 1), value = height(u, v), val = clamp((value - renderer.range[0]) / (renderer.range[1] - renderer.range[0] || 1));
                let c = s.mode === 0 && colors ? color(u, v, value).map(c => Math.pow(Math.max(0, c), 1 / 2.2)) : s.mode === 3 ? normal(u, v).map(c => c * .5 + .5) : [val, val, val];
                if (s.contours && Math.abs((val * 25 + .5) % 1 - .5) < .025)
                    c = c.map(c => c * .65);
                const i = (y * size + x) * 4;
                img.data[i] = clamp(c[0]) * 255;
                img.data[i + 1] = clamp(c[1]) * 255;
                img.data[i + 2] = clamp(c[2]) * 255;
                img.data[i + 3] = 255;
            }
        ctx.putImageData(img, x0, y0);
        return;
    }
    if (s.grid) {
        ctx.lineWidth = .65;
        for (let i = -16; i <= 16; i++) {
            ctx.strokeStyle = i % 4 === 0 ? '#405058' : '#303f48';
            const v = i * .25;
            for (const coords of [[v, -.115, -4, v, -.115, 4], [-4, -.115, v, 4, -.115, v]]) {
                const a = project(...coords.slice(0, 3)), b = project(...coords.slice(3));
                if (a[3] <= 0 || b[3] <= 0)
                    continue;
                ctx.beginPath();
                ctx.moveTo(a[0], a[1]);
                ctx.lineTo(b[0], b[1]);
                ctx.stroke();
            }
        }
    }
    const image = ctx.getImageData(0, 0, w, h), pixels = image.data, depth = new Float32Array(w * h);
    depth.fill(Infinity);
    const triangle = (a, b, c) => { if (a[3] <= 0 || b[3] <= 0 || c[3] <= 0)
        return; const den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]); if (Math.abs(den) < 1e-7)
        return; const xmin = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))), xmax = Math.min(w - 1, Math.ceil(Math.max(a[0], b[0], c[0]))), ymin = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), ymax = Math.min(h - 1, Math.ceil(Math.max(a[1], b[1], c[1]))); for (let y = ymin; y <= ymax; y++)
        for (let x = xmin; x <= xmax; x++) {
            const px = x + .5, py = y + .5, u = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (py - c[1])) / den, v = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (py - c[1])) / den, t = 1 - u - v;
            if (u < -.0001 || v < -.0001 || t < -.0001)
                continue;
            const z = u * a[2] + v * b[2] + t * c[2], i = y * w + x;
            if (z >= depth[i] || z < -1 || z > 1)
                continue;
            depth[i] = z;
            const inv = 1 / (u * a[3] + v * b[3] + t * c[3]);
            for (let k = 0; k < 3; k++)
                pixels[i * 4 + k] = (u * a[4 + k] * a[3] + v * b[4 + k] * b[3] + t * c[4 + k] * c[3]) * inv;
            pixels[i * 4 + 3] = 255;
        } };
    const verts = Array(stride * stride);
    for (let y = 0; y < stride; y++)
        for (let x = 0; x < stride; x++) {
            const u = x / nseg, v = y / nseg, value = height(u, v), pos = project((u - .5) * 2, value * s.heightScale, (v - .5) * 2), N = normal(u, v);
            let c = color(u, v, value), shade = 1;
            if (s.mode === 1)
                c = Array(3).fill(clamp((value - renderer.range[0]) / (renderer.range[1] - renderer.range[0] || 1)));
            if (s.mode === 2)
                c = [.46, .49, .51];
            if (s.shadows && s.mode !== 3) {
                let t = .018;
                for (let k = 0; k < 14; k++) {
                    const xx = u + light[0] * t * .5, yy = v + light[2] * t * .5;
                    if (xx < 0 || xx > 1 || yy < 0 || yy > 1)
                        break;
                    if (height(xx, yy) * s.heightScale > value * s.heightScale + light[1] * t + .006) {
                        shade = .33;
                        break;
                    }
                    t = t * 1.23 + .012;
                }
            }
            const ndl = Math.max(0, N[0] * light[0] + N[1] * light[1] + N[2] * light[2]), e = 5 / (n - 1), avg = (height(u - e, v) + height(u + e, v) + height(u, v - e) + height(u, v + e)) / 4, ao = 1 - clamp((avg - value) * 18, 0, .5);
            if (s.mode === 3)
                c = N.map(t => (t * .5 + .5) * 255);
            else
                c = c.map((t, k) => tone(t * ([.31, .39, .46][k] * (.65 + .35 * N[1]) * ao + [1.15, 1.07, .9][k] * ndl * shade)));
            if (s.contours && Math.abs((value * 40 + .5) % 1 - .5) < .03)
                c = c.map(t => t * .6);
            verts[y * stride + x] = [...pos, ...c];
        }
    const bottom = (a, u, v) => [...project((u - .5) * 2, -.105, (v - .5) * 2), 39, 36, 31];
    for (let y = 0; y < nseg; y++)
        for (let x = 0; x < nseg; x++) {
            const a = verts[y * stride + x], b = verts[y * stride + x + 1], c = verts[(y + 1) * stride + x], d = verts[(y + 1) * stride + x + 1];
            triangle(a, c, b);
            triangle(b, c, d);
        }
    for (let edge = 0; edge < 4; edge++)
        for (let t = 0; t < nseg; t++) {
            const u0 = edge < 2 ? edge : t / nseg, v0 = edge < 2 ? t / nseg : edge - 2, u1 = edge < 2 ? edge : (t + 1) / nseg, v1 = edge < 2 ? (t + 1) / nseg : edge - 2;
            const aa = verts[Math.round(v0 * nseg) * stride + Math.round(u0 * nseg)], bb = verts[Math.round(v1 * nseg) * stride + Math.round(u1 * nseg)], a = [...aa.slice(0, 4), 67, 62, 53], b = [...bb.slice(0, 4), 67, 62, 53], c = bottom(a, u0, v0), d = bottom(b, u1, v1);
            triangle(a, c, b);
            triangle(b, c, d);
        }
    if (s.water) {
        const water = (u, v) => { const d = s.waterLevel - height(u, v), color = d < 0 ? [.24, .4, .35] : [.03, .17, .2]; return [...project((u - .5) * 2, s.waterLevel * s.heightScale + .001, (v - .5) * 2), ...color.map(t => tone(t))]; };
        const ws = 48;
        for (let y = 0; y < ws; y++)
            for (let x = 0; x < ws; x++) {
                const u = x / ws, v = y / ws, a = water(u, v), b = water(u + 1 / ws, v), c = water(u, v + 1 / ws), d = water(u + 1 / ws, v + 1 / ws);
                triangle(a, c, b);
                triangle(b, c, d);
            }
    }
    ctx.putImageData(image, 0, 0);
    if (s.mode === 4) {
        ctx.strokeStyle = '#82b6a566';
        ctx.lineWidth = .5;
        for (let y = 0; y < stride; y += 2) {
            ctx.beginPath();
            for (let x = 0; x < stride; x++) {
                const a = verts[y * stride + x];
                if (a[3] > 0) {
                    if (x === 0)
                        ctx.moveTo(a[0], a[1]);
                    else
                        ctx.lineTo(a[0], a[1]);
                }
            }
            ctx.stroke();
        }
        for (let x = 0; x < stride; x += 2) {
            ctx.beginPath();
            for (let y = 0; y < stride; y++) {
                const a = verts[y * stride + x];
                if (a[3] > 0) {
                    if (y === 0)
                        ctx.moveTo(a[0], a[1]);
                    else
                        ctx.lineTo(a[0], a[1]);
                }
            }
            ctx.stroke();
        }
    }
}
