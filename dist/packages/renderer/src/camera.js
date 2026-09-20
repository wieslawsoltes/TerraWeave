import { clamp, perspective, lookAt, multiply } from '../../math/src/index.js';
/** Pointer-captured orbit camera with touch pinch, wheel dolly and screen-space pan. */
export class OrbitCamera {
    constructor(canvas, onChange) {
        this.canvas = canvas;
        this.onChange = onChange;
        this.yaw = .76;
        this.pitch = .57;
        this.distance = 3.95;
        this.target = [0, .15, 0];
        this.pointers = new Map();
        this.enabled = true;
        this.abort = new AbortController();
        const opts = { signal: this.abort.signal };
        canvas.addEventListener('contextmenu', e => e.preventDefault(), opts);
        canvas.addEventListener('pointerdown', e => { if (!this.enabled)
            return; canvas.focus(); canvas.setPointerCapture(e.pointerId); this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); this.button = e.button; this.onChange(); }, opts);
        canvas.addEventListener('pointermove', e => {
            if (!this.enabled || !this.pointers.has(e.pointerId))
                return;
            const old = this.pointers.get(e.pointerId), dx = e.clientX - old.x, dy = e.clientY - old.y;
            if (this.pointers.size === 2) {
                const other = [...this.pointers.entries()].find(([id]) => id !== e.pointerId)[1];
                const d0 = Math.hypot(old.x - other.x, old.y - other.y), d1 = Math.hypot(e.clientX - other.x, e.clientY - other.y);
                if (d0 > 0 && d1 > 0)
                    this.distance = clamp(this.distance * d0 / d1, .5, 14);
                this.pan(dx * .5, dy * .5);
            }
            else if (this.button === 1 || this.button === 2 || e.shiftKey)
                this.pan(dx, dy);
            else {
                this.yaw -= dx * .007;
                this.pitch = clamp(this.pitch + dy * .007, .05, 1.54);
            }
            this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            this.onChange();
        }, opts);
        const end = e => { this.pointers.delete(e.pointerId); };
        canvas.addEventListener('pointerup', end, opts);
        canvas.addEventListener('pointercancel', end, opts);
        canvas.addEventListener('lostpointercapture', end, opts);
        canvas.addEventListener('wheel', e => { if (!this.enabled)
            return; e.preventDefault(); this.distance = clamp(this.distance * Math.exp(e.deltaY * (e.deltaMode === 1 ? .022 : .0012)), .5, 14); this.onChange(); }, { ...opts, passive: false });
        canvas.addEventListener('dblclick', () => { if (this.enabled)
            this.reset(); }, opts);
    }
    pan(dx, dy) { const factor = this.distance * .0012; this.target[0] += (-Math.cos(this.yaw) * dx + Math.sin(this.yaw) * dy) * factor; this.target[2] += (Math.sin(this.yaw) * dx + Math.cos(this.yaw) * dy) * factor; }
    reset() { this.yaw = .76; this.pitch = .57; this.distance = 3.95; this.target = [0, .15, 0]; this.onChange(); }
    preset(view) { if (view === 'top') {
        this.pitch = 1.535;
        this.yaw = 0;
    }
    else if (view === 'front') {
        this.pitch = .14;
        this.yaw = 0;
    }
    else
        this.reset(); this.onChange(); }
    get eye() { const c = Math.cos(this.pitch); return [this.target[0] + Math.sin(this.yaw) * c * this.distance, this.target[1] + Math.sin(this.pitch) * this.distance, this.target[2] + Math.cos(this.yaw) * c * this.distance]; }
    matrix(aspect, webgpu = true) { return multiply(perspective(.69, aspect, .025, 50, webgpu), lookAt(this.eye, this.target)); }
    dispose() { this.abort.abort(); this.pointers.clear(); }
}
