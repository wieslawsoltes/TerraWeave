import { runCPU, fromPlain, toPlain } from './index.js';
import { releasePacket } from '@terraweave/core';
self.onmessage = async ({ data }) => {
    const { id, node, inputs, n, context } = data;
    const packets = Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, fromPlain(v)]));
    try {
        const result = await runCPU(node, packets, n, context), plain = toPlain(result), transfer = [plain.height.buffer, ...Object.values(plain.maps).map(a => a.buffer), ...(plain.color ? [plain.color.buffer] : [])];
        self.postMessage({ id, result: plain }, [...new Set(transfer)]);
        releasePacket(result);
    }
    catch (e) {
        self.postMessage({ id, error: e.message });
    }
    finally {
        for (const p of Object.values(packets))
            releasePacket(p);
    }
};
