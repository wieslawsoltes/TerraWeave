import { registry } from '@terraweave/nodes';
const paths = {
    mountain: '<path d="m2 19 7-13 4 7 3-5 6 11H2Z"/><path d="m6 12 3 2 2-3m3 4 2 1 2-2"/>',
    logo: '<path d="M3 19 11 4l10 15H3Z"/><path d="m7 19 5-9 6 9M5 15h14M9 11h7"/>',
    noise: '<path d="M3 17 6 9l4 5 4-11 3 13 4-7M3 21h18"/>',
    island: '<path d="m4 15 6-9 3 5 3-3 4 7M2 19c3-3 5 3 8 0s5 3 8 0 3 0 4 0"/>',
    volcano: '<path d="m2 20 7-13h6l7 13H2ZM9 7l3 6 3-6M10 3l1-2m3 2 1-2"/>',
    dunes: '<path d="M2 18c6-12 12-12 20 0M2 19c9-6 10-1 20 0M3 9c3-3 4-3 7-3"/>',
    canyon: '<path d="M2 5h7l2 5-2 9h5l1-7 4-3h3M3 9h4m-3 4h4m10 0h4m-7 5h7"/>',
    crater: '<ellipse cx="12" cy="14" rx="10" ry="6"/><ellipse cx="12" cy="12" rx="5" ry="3"/>',
    cells: '<path d="m2 8 6-5 7 2 6 7-5 8-8-1-6-5V8ZM8 3l2 8-8 3m8-3 6 9m-6-9 11 1m-6-7-5 6"/>',
    ridge: '<path d="m2 20 5-8 5-9 3 8 7 9H2ZM7 12l3 3 2-12 1 13 2-5"/>',
    gradient: '<path d="M4 4h16v16H4ZM4 16h16M4 12h16M4 8h16"/>',
    square: '<rect x="4" y="4" width="16" height="16" rx="2"/>',
    water: '<path d="M12 2S5 10 5 15a7 7 0 0 0 14 0c0-5-7-13-7-13Z"/><path d="M8 15c0 2 1 3 3 3"/>',
    thermal: '<path d="m3 20 8-16 10 16H3ZM10 9l3 3-3 3 4 3M5 20l2-4m10 0 2 4"/>',
    snow: '<path d="M12 2v20M3 7l18 10M3 17 21 7M8 4l4 4 4-4M8 20l4-4 4 4M3 11l5-1-1-5m10 14-1-5 5-1M3 13l5 1-1 5m10-14-1 5 5 1"/>',
    combine: '<rect x="3" y="3" width="12" height="12" rx="2"/><rect x="9" y="9" width="12" height="12" rx="2"/>',
    warp: '<path d="M3 4c8-4 10 5 18 1M3 12c8-4 10 5 18 1M3 20c8-4 10 5 18 1M7 2c5 6-4 13 1 20m8-20c5 6-4 13 1 20"/>',
    terrace: '<path d="M2 20h5v-5h5v-5h5V5h5"/>',
    levels: '<path d="M4 20V4m0 16h16M7 17l4-4 3-6h6"/>',
    clamp: '<path d="M4 5h16M4 19h16M8 12h8m-4-4v8"/>',
    invert: '<path d="M12 3a9 9 0 1 0 0 18V3Z"/><circle cx="12" cy="12" r="9"/>',
    blur: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7" stroke-dasharray="2 2"/><circle cx="12" cy="12" r="10" stroke-dasharray="1 4"/>',
    sharpen: '<path d="m4 19 8-15 8 15H4Zm5-4 3-6 3 6"/>',
    transform: '<path d="M4 9V4h5m6 0h5v5m0 6v5h-5M9 20H4v-5"/><path d="m9 15 6-6m-6 0h6v6"/>',
    power: '<path d="M4 19V5m0 14h16M7 17c8 0 4-12 12-12"/>',
    absolute: '<path d="M4 4v16h16M7 7l5 10 7-13"/>',
    normalize: '<path d="M4 20V4m0 16h16M6 17 18 5m-5 0h5v5"/>',
    slope: '<path d="M3 20 21 6v14H3Z"/><path d="M10 20a7 7 0 0 0-2-5"/>',
    height: '<path d="M4 20V4m-2 3 2-3 2 3M9 20l4-10 3 5 5-11M2 20h20"/>',
    curvature: '<path d="M2 17c5 0 5-13 10-13s5 13 10 13M5 20h14"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="m15 8-2 6-5 2 2-6 5-2Z"/>',
    edge: '<rect x="4" y="4" width="16" height="16" rx="3"/><rect x="8" y="8" width="8" height="8" rx="2" stroke-dasharray="2 2"/>',
    flow: '<path d="M5 2c0 5 6 4 6 10s-6 5-6 10M15 2c-7 5-1 9 0 12s5 6 4 8m-8-10 4-5m-4 8 5 3"/>',
    palette: '<path d="M12 3a9 9 0 1 0 0 18h2a2 2 0 0 0 0-4c-3 0-3-3 0-3h4a3 3 0 0 0 3-3 9 9 0 0 0-9-8Z"/><circle cx="7" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7" r="1"/>',
    brush: '<path d="m14 4 6-2 2 6-10 9-5-5 7-8ZM7 12l5 5c-1 5-5 5-9 4 2-1 0-5 4-9Z"/>',
    import: '<path d="M12 3v12m-4-4 4 4 4-4M4 15v5h16v-5"/>',
    output: '<path d="M12 16V4m-4 4 4-4 4 4M4 14v6h16v-6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
    chevron: '<path d="m8 5 7 7-7 7"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    undo: '<path d="M4 9h10a6 6 0 0 1 0 12M4 9l5-5M4 9l5 5"/>',
    redo: '<path d="M20 9H10a6 6 0 0 0 0 12m10-12-5-5m5 5-5 5"/>',
    play: '<path d="m8 4 12 8-12 8V4Z"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="1"/>',
    save: '<path d="M4 3h13l4 4v14H3V3h1Zm3 0v6h10V3M7 21v-8h10v8"/>',
    folder: '<path d="M3 6h7l2 3h9v11H3V6Z"/>',
    file: '<path d="M5 3h9l5 5v13H5V3Zm9 0v6h5"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3"/>',
    trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
    copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V3H3v13h5"/>',
    fit: '<path d="M3 9V3h6m6 0h6v6m0 6v6h-6M9 21H3v-6"/><rect x="8" y="8" width="8" height="8"/>',
    grid: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18m6-18v18"/>',
    cube: '<path d="m12 2 10 6v9l-10 5-10-5V8l10-6Zm0 11 10-5M2 8l10 5m0 0v9"/>',
    map: '<path d="m2 5 6-3 8 3 6-3v17l-6 3-8-3-6 3V5Zm6-3v17m8-14v17"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/>',
    settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9 8a3 3 0 0 1 6 1c0 2-3 2-3 5m0 3v1"/>',
    check: '<path d="m4 12 5 5L20 6"/>',
    warning: '<path d="m12 3 10 18H2L12 3Zm0 5v6m0 3v1"/>',
    star: '<path d="m12 2 3 7 7 1-5 5 1 7-6-4-6 4 1-7-5-5 7-1 3-7Z"/>',
    refresh: '<path d="M20 7a8 8 0 1 0 1 7m-1-7h-6m6 0V1"/>',
    globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 6h14M5 18h14"/>',
    split: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 3v18M16 3v18"/>',
    nodes: '<rect x="2" y="4" width="6" height="6" rx="1"/><rect x="16" y="14" width="6" height="6" rx="1"/><path d="M8 7h4v10h4"/>',
    camera: '<path d="M3 7h4l2-3h6l2 3h4v14H3V7Z"/><circle cx="12" cy="14" r="4"/>',
    chart: '<path d="M4 3v17h17M8 16v-5m5 5V7m5 9V4"/>',
    bolt: '<path d="m13 2-9 12h7l-1 8 10-13h-8l1-7Z"/>',
    code: '<path d="m8 5-6 7 6 7m8-14 6 7-6 7M14 3l-4 18"/>',
    dots: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'
};
export function icon(name, size = 18) { return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.mountain}</svg>`; }
export const escapeHTML = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function el(tag, className = '', text = null) { const e = document.createElement(tag); if (className)
    e.className = className; if (text !== null)
    e.textContent = text; return e; }
export function iconButton(name, label, onClick, className = '') { const b = el('button', 'icon-button ' + className); b.type = 'button'; b.innerHTML = icon(name); b.title = label; b.setAttribute('aria-label', label); if (onClick)
    b.addEventListener('click', onClick); return b; }
export function parameterControl(key, spec, value, { onBegin = () => { }, onChange = () => { } } = {}) {
    const row = el('div', 'parameter');
    row.dataset.param = key;
    const head = el('div', 'parameter-head'), label = el('label', '', spec.label);
    head.append(label);
    row.append(head);
    let active = false;
    const begin = () => { if (!active) {
        active = true;
        onBegin();
    } };
    const end = () => { active = false; };
    if (spec.kind === 'select') {
        const select = el('select', 'select-input');
        for (const option of spec.options) {
            const v = typeof option === 'object' ? option.value : option, l = typeof option === 'object' ? option.label : option;
            const o = el('option', '', l);
            o.value = JSON.stringify(v);
            select.append(o);
        }
        select.value = JSON.stringify(value);
        select.setAttribute('aria-label', spec.label);
        select.addEventListener('change', () => { onBegin(); onChange(JSON.parse(select.value), true); });
        row.append(select);
        return row;
    }
    if (spec.kind === 'boolean') {
        const input = el('input');
        input.type = 'checkbox';
        input.checked = value;
        label.append(input);
        input.addEventListener('change', () => { onBegin(); onChange(input.checked, true); });
        return row;
    }
    const number = el('input', 'number-input');
    number.type = 'number';
    number.value = value;
    number.min = spec.min;
    number.max = spec.max;
    number.step = spec.step;
    number.setAttribute('aria-label', `${spec.label} value`);
    head.append(number);
    const slider = el('input', 'range-input');
    slider.type = 'range';
    slider.min = spec.min;
    slider.max = spec.max;
    slider.step = spec.step;
    slider.value = value;
    slider.setAttribute('aria-label', spec.label);
    const fill = () => slider.style.setProperty('--fill', `${(Number(slider.value) - spec.min) / (spec.max - spec.min) * 100}%`);
    fill();
    slider.addEventListener('pointerdown', begin);
    slider.addEventListener('pointerup', end);
    slider.addEventListener('pointercancel', end);
    slider.addEventListener('keydown', begin);
    slider.addEventListener('keyup', end);
    slider.addEventListener('blur', end);
    slider.addEventListener('input', () => { begin(); number.value = slider.value; fill(); onChange(Number(slider.value), false); });
    slider.addEventListener('change', () => { onChange(Number(slider.value), true); end(); });
    number.addEventListener('focus', () => { active = false; });
    number.addEventListener('change', () => { const parsed = Number(number.value); if (!Number.isFinite(parsed)) {
        number.value = slider.value;
        return;
    } begin(); const v = Math.max(spec.min, Math.min(spec.max, parsed)); slider.value = v; number.value = slider.value; fill(); onChange(Number(slider.value), true); end(); });
    row.append(slider);
    return row;
}
export function parameterPanel(node, callbacks = {}) { const fragment = document.createDocumentFragment(); for (const [key, spec] of Object.entries(registry[node.type].params))
    fragment.append(parameterControl(key, spec, node.params[key], { onBegin: () => callbacks.onBegin?.(key), onChange: (v, commit) => callbacks.onChange?.(key, v, commit) })); return fragment; }
let toastRoot;
export function toast(message, { type = 'info', detail = '', duration = 6000 } = {}) { if (!toastRoot) {
    toastRoot = el('div', 'toast-stack');
    toastRoot.setAttribute('aria-live', 'polite');
    document.body.append(toastRoot);
} const node = el('div', 'toast ' + type), symbol = el('span', 'toast-icon'); symbol.innerHTML = icon(type === 'error' ? 'warning' : type === 'success' ? 'check' : 'bolt'); const text = el('div', 'toast-text'); text.append(el('strong', '', message)); if (detail)
    text.append(el('p', '', detail)); node.append(symbol, text, iconButton('close', 'Dismiss', () => node.remove())); toastRoot.append(node); while (toastRoot.children.length > 4)
    toastRoot.firstElementChild.remove(); setTimeout(() => node.remove(), duration); return node; }
export function modal(title, { wide = false, onClose = null } = {}) { const dialog = el('dialog', 'modal' + (wide ? ' wide' : '')), head = el('header', 'modal-head'), body = el('div', 'modal-body'), footer = el('footer', 'modal-footer'); head.append(el('h2', '', title)); let closed = false; const close = () => { if (closed)
    return; closed = true; dialog.close(); dialog.remove(); onClose?.(); }; head.append(iconButton('close', 'Close dialog', close)); dialog.append(head, body, footer); document.body.append(dialog); dialog.addEventListener('cancel', e => { e.preventDefault(); close(); }); dialog.addEventListener('click', e => { if (e.target === dialog) {
    const r = dialog.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
        close();
} }); dialog.showModal(); return { dialog, body, footer, close }; }
let openMenu = null;
export function menu(anchor, items) {
    openMenu?.();
    const root = el('div', 'context-menu');
    root.setAttribute('role', 'menu');
    const controller = new AbortController();
    const close = () => { root.remove(); controller.abort(); if (openMenu === close)
        openMenu = null; };
    openMenu = close;
    for (const item of items) {
        if (item.separator) {
            root.append(el('hr'));
            continue;
        }
        const button = el('button', 'menu-item');
        button.type = 'button';
        button.setAttribute('role', 'menuitem');
        button.disabled = !!item.disabled;
        if (item.icon) {
            const i = el('span');
            i.innerHTML = icon(item.icon, 16);
            button.append(i);
        }
        button.append(el('span', '', item.label));
        if (item.shortcut)
            button.append(el('kbd', '', item.shortcut));
        button.addEventListener('click', () => { close(); item.action?.(); });
        root.append(button);
    }
    document.body.append(root);
    const r = anchor instanceof Element ? anchor.getBoundingClientRect() : { left: anchor.x, bottom: anchor.y };
    root.style.left = Math.max(8, Math.min(r.left, innerWidth - root.offsetWidth - 8)) + 'px';
    root.style.top = Math.max(8, Math.min(r.bottom + 4, innerHeight - root.offsetHeight - 8)) + 'px';
    queueMicrotask(() => document.addEventListener('pointerdown', e => { if (!root.contains(e.target))
        close(); }, { signal: controller.signal }));
    document.addEventListener('keydown', e => { if (e.key === 'Escape')
        close(); }, { signal: controller.signal });
    root.querySelector('button:not(:disabled)')?.focus();
    return close;
}
export function histogram(canvas, bins) { const ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height; ctx.clearRect(0, 0, w, h); let max = 1; for (const v of bins)
    max = Math.max(max, v); ctx.fillStyle = '#74bda7'; for (let i = 0; i < bins.length; i++) {
    const value = Math.sqrt(bins[i] / max);
    ctx.fillRect(i * w / bins.length, h - value * (h - 5), Math.max(1, w / bins.length - 1), value * (h - 5));
} }
export function terrainThumbnail(canvas, data, n, { colors = null, mask = false } = {}) { const w = canvas.width, h = canvas.height, ctx = canvas.getContext('2d'), image = ctx.createImageData(w, h); let min = Infinity, max = -Infinity; for (const v of data) {
    min = Math.min(min, v);
    max = Math.max(max, v);
} for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
        const xx = Math.min(n - 1, Math.floor(x / w * n)), yy = Math.min(n - 1, Math.floor(y / h * n)), i = yy * n + xx, v = (data[i] - min) / (max - min || 1), dx = data[yy * n + Math.min(n - 1, xx + 1)] - data[yy * n + Math.max(0, xx - 1)], dy = data[Math.min(n - 1, yy + 1) * n + xx] - data[Math.max(0, yy - 1) * n + xx], shade = Math.max(.18, Math.min(1, .65 + (-dx + dy) * n * .24)), dst = (y * w + x) * 4;
        let rgb = mask ? [v, v, v] : colors ? [colors[i * 4], colors[i * 4 + 1], colors[i * 4 + 2]] : [.10 + v * .54, .16 + v * .52, .15 + v * .48];
        for (let c = 0; c < 3; c++)
            image.data[dst + c] = Math.round(Math.pow(Math.max(0, Math.min(1, rgb[c] * (mask ? 1 : shade))), .65) * 255);
        image.data[dst + 3] = 255;
    } ctx.putImageData(image, 0, 0); }
export function resizer(handle, onMove) { let start = 0; handle.addEventListener('pointerdown', e => { start = e.clientY; handle.setPointerCapture(e.pointerId); handle.classList.add('dragging'); }); handle.addEventListener('pointermove', e => { if (!handle.hasPointerCapture(e.pointerId))
    return; const dy = e.clientY - start; start = e.clientY; onMove(dy); }); const end = () => handle.classList.remove('dragging'); handle.addEventListener('pointerup', end); handle.addEventListener('pointercancel', end); }
