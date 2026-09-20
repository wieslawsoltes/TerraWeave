/** Declarative node schemas shared by CPU kernels, WGSL dispatch and editor controls. */
const num = (label, value, min, max, step = .01) => ({ label, default: value, min, max, step, kind: 'number' });
const choice = (label, value, options) => ({ label, default: value, options, kind: 'select' });
const noise = { seed: num('Seed', 42, 0, 65535, 1), scale: num('Feature scale', 3.4, .1, 30, .05), octaves: num('Detail octaves', 7, 1, 10, 1), roughness: num('Roughness', .52, .05, .9), warp: num('Domain warp', .9, 0, 3), height: num('Amplitude', .85, 0, 2) };
const def = (label, category, icon, op, params = {}, inputs = [], description = '', outputs = ['height']) => ({ label, category, icon, op, params, inputs, description, outputs });
export const categories = { Terrain: { color: '#dba76a', description: 'Begin with a landform' }, Simulate: { color: '#65b7e9', description: 'Let natural processes shape it' }, Modify: { color: '#b497e8', description: 'Sculpt the underlying structure' }, Derive: { color: '#74c7b1', description: 'Extract meaning from the surface' }, Colorize: { color: '#df93bd', description: 'Bring the landscape to life' }, Utility: { color: '#a3aab8', description: 'Connect your production pipeline' } };
export const registry = {
    mountain: def('Mountain', 'Terrain', 'mountain', 1, noise, [], 'Warped ridged multifractal peaks, with a radial landform envelope.'),
    noise: def('Fractal noise', 'Terrain', 'noise', 2, { ...noise, mode: choice('Fractal type', 0, [{ value: 0, label: 'Fractal Brownian' }, { value: 1, label: 'Ridged' }, { value: 2, label: 'Billow' }]) }, [], 'Deterministic integer-hash value noise with fractal octave synthesis.'),
    island: def('Island', 'Terrain', 'island', 3, { ...noise, radius: num('Island radius', .86, .1, 1.5), falloff: num('Coast falloff', 2.1, .2, 5) }, [], 'Fractal terrain constrained by a softly eroded island coastline.'),
    volcano: def('Volcano', 'Terrain', 'volcano', 4, { ...noise, crater: num('Crater radius', .23, .04, .6), rim: num('Rim sharpness', 3, 1, 8) }, [], 'Radial volcanic cone with a caldera, rim and fluted slopes.'),
    dunes: def('Dunes', 'Terrain', 'dunes', 5, { ...noise, angle: num('Wind direction', 25, 0, 360, 1), sharpness: num('Crest shape', 2.3, .3, 6) }, [], 'Wind-aligned sinusoidal dunes with warped, asymmetric crests.'),
    canyon: def('Canyon', 'Terrain', 'canyon', 6, { ...noise, width: num('Valley width', .16, .02, .7), depth: num('Incision', .7, 0, 1) }, [], 'Meandering incised channels through a stratified plateau.'),
    crater: def('Crater', 'Terrain', 'crater', 7, { ...noise, radius: num('Impact radius', .48, .05, .95), rim: num('Rim height', .45, 0, 1) }, [], 'Impact bowl, raised rim, radial ejecta and surface breakup.'),
    cellular: def('Cellular', 'Terrain', 'cells', 8, { ...noise, mode: choice('Distance field', 0, [{ value: 0, label: 'Cells / F1' }, { value: 1, label: 'Ridges / F2 − F1' }]) }, [], 'Voronoi distance fields for plates, rock formations and masks.'),
    ridge: def('Ridge range', 'Terrain', 'ridge', 9, { ...noise, angle: num('Range direction', 35, 0, 360, 1), width: num('Range width', .38, .05, 1) }, [], 'Directional mountain range with a warped central spine.'),
    gradient: def('Gradient', 'Terrain', 'gradient', 10, { angle: num('Angle', 0, 0, 360, 1), offset: num('Offset', 0, -1, 1), contrast: num('Contrast', 1, .05, 5), radial: choice('Shape', 0, [{ value: 0, label: 'Linear' }, { value: 1, label: 'Radial' }, { value: 2, label: 'Square' }]) }, [], 'Linear, radial and box distance masks.'),
    constant: def('Constant', 'Terrain', 'square', 11, { value: num('Height', .35, 0, 1) }, [], 'A uniform scalar field.'),
    hydraulic: def('Hydraulic erosion', 'Simulate', 'water', 100, { iterations: num('Simulation steps', 90, 1, 400, 1), rain: num('Rainfall', .004, 0, .025, .0005), erosion: num('Erodibility', .16, 0, 1), capacity: num('Sediment capacity', 4, .1, 12, .1), deposition: num('Deposition', .3, 0, 1), evaporation: num('Evaporation', .075, 0, .5, .005), flowRate: num('Flow response', .35, .05, .8) }, ['a', 'mask'], 'Conservative four-neighbor water and sediment transport. Mask controls rainfall. Dry sediment settles into the output.', ['height', 'flow', 'wear', 'deposition', 'water']),
    thermal: def('Thermal erosion', 'Simulate', 'thermal', 101, { iterations: num('Simulation steps', 35, 1, 300, 1), talus: num('Talus angle', 32, 0, 80, 1), rate: num('Transport rate', .55, 0, 1) }, ['a', 'mask'], 'Conservative talus transport using world-space slope and closed boundaries.'),
    snow: def('Snow accumulation', 'Simulate', 'snow', 12, { line: num('Snow line', .5, 0, 1), amount: num('Accumulation', .06, 0, .3), slope: num('Slope adhesion', 2.4, .1, 10), softness: num('Transition', .16, .01, .5) }, ['a', 'mask'], 'Deposits a slope-aware snow layer above an altitude threshold.', ['height', 'snow']),
    combine: def('Combine', 'Modify', 'combine', 13, { mode: choice('Blend operation', 0, [{ value: 0, label: 'Blend' }, { value: 1, label: 'Add' }, { value: 2, label: 'Multiply' }, { value: 3, label: 'Maximum' }, { value: 4, label: 'Minimum' }, { value: 5, label: 'Subtract' }, { value: 6, label: 'Screen' }, { value: 7, label: 'Difference' }]), mix: num('Influence', .5, 0, 1) }, ['a', 'b', 'mask'], 'Eight field operations with independently weighted mask input.'),
    warp: def('Warp', 'Modify', 'warp', 14, { strength: num('Displacement', .08, 0, .4), scale: num('Noise scale', 4, .1, 30), seed: num('Seed', 72, 0, 65535, 1) }, ['a', 'b', 'mask'], 'Bilinear domain displacement, optionally driven by another field.'),
    terrace: def('Terrace', 'Modify', 'terrace', 15, { steps: num('Terraces', 9, 2, 48, 1), softness: num('Slope transition', .3, .001, 1), offset: num('Layer offset', 0, 0, 1) }, ['a', 'mask'], 'Terraced stratification with adjustable transition width.'),
    levels: def('Levels', 'Modify', 'levels', 16, { low: num('Input black', .05, 0, .99), high: num('Input white', .95, .01, 1), gamma: num('Gamma', 1, .1, 5), outLow: num('Output black', 0, 0, 1), outHigh: num('Output white', 1, 0, 1) }, ['a', 'mask'], 'Remap height values with input range, gamma and output range controls.'),
    clamp: def('Clamp', 'Modify', 'clamp', 17, { low: num('Minimum', .1, 0, 1), high: num('Maximum', .85, 0, 1) }, ['a', 'mask'], 'Clip values to an interval.'),
    invert: def('Invert', 'Modify', 'invert', 18, {}, ['a', 'mask'], 'Reverse elevation or mask values.'),
    blur: def('Blur', 'Modify', 'blur', 19, { radius: num('Radius (texels)', 2, 1, 12, 1) }, ['a', 'mask'], 'Separable-equivalent box neighborhood filter with clamped boundaries.'),
    sharpen: def('Sharpen', 'Modify', 'sharpen', 20, { strength: num('Strength', 1.1, 0, 4) }, ['a', 'mask'], 'Laplacian sharpening of ridges and surface structure.'),
    transform: def('Transform', 'Modify', 'transform', 21, { angle: num('Rotation', 0, -180, 180, 1), scale: num('Scale', 1, .1, 4), x: num('Offset X', 0, -1, 1), y: num('Offset Y', 0, -1, 1) }, ['a', 'mask'], 'Centered rotation, scale and translation with bilinear resampling.'),
    power: def('Power', 'Modify', 'power', 22, { exponent: num('Exponent', 1.6, .1, 6) }, ['a', 'mask'], 'Reshape elevation distribution without introducing new extrema.'),
    absolute: def('Absolute', 'Modify', 'absolute', 23, { center: num('Center', .5, 0, 1), gain: num('Gain', 2, .1, 5) }, ['a', 'mask'], 'Fold the heightfield around a chosen elevation.'),
    normalize: def('Auto levels', 'Modify', 'normalize', 102, {}, ['a'], 'Full-field min/max reduction followed by a normalized remap.'),
    slope: def('Slope', 'Derive', 'slope', 24, { low: num('Start angle', 20, 0, 89, 1), high: num('End angle', 55, 1, 90, 1) }, ['a'], 'World-space terrain slope mask using centered finite differences.'),
    height: def('Height range', 'Derive', 'height', 25, { low: num('Lower altitude', .35, 0, 1), high: num('Upper altitude', .75, 0, 1), softness: num('Feather', .1, .001, .5) }, ['a'], 'Feathered selection of an elevation interval.'),
    curvature: def('Curvature', 'Derive', 'curvature', 26, { strength: num('Sensitivity', 3, .1, 20), mode: choice('Selection', 0, [{ value: 0, label: 'Concave + convex' }, { value: 1, label: 'Convex ridges' }, { value: 2, label: 'Concave valleys' }]) }, ['a'], 'Discrete Laplacian curvature mask for ridges and crevices.'),
    aspect: def('Aspect', 'Derive', 'compass', 27, { angle: num('Facing direction', 135, 0, 360, 1), width: num('Angular spread', 90, 1, 180, 1) }, ['a'], 'Select slopes facing an azimuth; useful for wind, sun and snow.'),
    edge: def('Edge falloff', 'Derive', 'edge', 28, { width: num('Border width', .18, .01, .5), power: num('Falloff power', 1, .1, 5) }, ['a'], 'A square border mask multiplied by the input, or standalone.'),
    flow: def('Flow accumulation', 'Derive', 'flow', 103, { strength: num('Contrast', 1, .1, 5) }, ['a'], 'D8 steepest-descent drainage accumulation. Uses a descending-height sort; closed pits do not drain.'),
    biome: def('Biome', 'Colorize', 'palette', 29, { palette: choice('Biome', 0, [{ value: 0, label: 'Alpine' }, { value: 1, label: 'Desert' }, { value: 2, label: 'Volcanic' }, { value: 3, label: 'Coastal' }, { value: 4, label: 'Arctic' }]), snowLine: num('Snow / upper zone', .57, 0, 1), rockSlope: num('Rock exposure', .6, .1, 2), variation: num('Color variation', .18, 0, .5) }, ['a', 'mask'], 'Terrain-aware RGBA color from elevation, slope and micro-variation. Mask blends color against uncolored height.', ['height', 'color']),
    colorize: def('Gradient color', 'Colorize', 'gradient', 30, { palette: choice('Gradient', 0, [{ value: 0, label: 'Moss → Stone → Snow' }, { value: 1, label: 'Ochre → Sand' }, { value: 2, label: 'Basalt → Ash' }, { value: 3, label: 'Jungle → Limestone' }, { value: 4, label: 'Ice → Snow' }]), low: num('Black point', 0, 0, .9), high: num('White point', 1, .1, 1) }, ['a'], 'Height-to-color gradient mapping.', ['height', 'color']),
    paint: def('Sculpt', 'Utility', 'brush', 104, { base: num('Base height', 0, 0, 1) }, ['a'], 'Non-destructive normalized brush strokes. Raise, lower, smooth and flatten in the 2D viewport.'),
    import: def('Heightfield', 'Utility', 'import', 105, { gain: num('Height gain', 1, .01, 4), offset: num('Height offset', 0, -1, 1) }, [], 'Embedded image or RAW heightfield resampled at build resolution.'),
    output: def('Output', 'Utility', 'output', 31, {}, ['a'], 'The final terrain and its associated material and simulation maps.')
};
export const inputLabels = { a: 'Terrain', b: 'Secondary', mask: 'Mask' };
export const portLabels = { height: 'Height', color: 'Color', flow: 'Flow', wear: 'Wear', deposition: 'Deposits', water: 'Water', snow: 'Snow' };
export function defaults(type) { return Object.fromEntries(Object.entries(registry[type].params).map(([k, v]) => [k, v.default])); }
export const presetDescriptions = { alpine: 'A glacial mountain massif with weathered ridges and snow-capped summits.', island: 'A volcanic archipelago emerging from shallow turquoise water.', desert: 'A wind-sculpted dune sea with warm sand and dramatic crests.', canyon: 'An incised sandstone plateau with exposed geological strata.', volcano: 'A weathered caldera surrounded by dark basaltic slopes.', arctic: 'Snow-covered peaks, talus slopes and a cold polar palette.' };
export function createPreset(key = 'alpine') {
    const titles = { alpine: 'Alpine watershed', island: 'Emerald archipelago', desert: 'Sirocco dune sea', canyon: 'Redrock basin', volcano: 'Obsidian caldera', arctic: 'Polar divide' };
    const p = { format: 'terraweave', version: 1, name: titles[key] || titles.alpine, resolution: 256, worldSize: 4000, elevation: 1800, nodes: [], edges: [], output: 'out', view: { palette: { alpine: 0, island: 3, desert: 1, canyon: 1, volcano: 2, arctic: 4 }[key] ?? 0, waterLevel: key === 'island' ? .12 : .03, snowLine: key === 'arctic' ? .36 : .6 } };
    function n(id, type, x, y, params = {}) { p.nodes.push({ id, type, name: registry[type].label, x, y, params: { ...defaults(type), ...params }, enabled: true }); }
    function e(from, to, input = 'a', port = 'height') { p.edges.push({ from, port, to, input }); }
    const source = { alpine: 'mountain', island: 'island', desert: 'dunes', canyon: 'canyon', volcano: 'volcano', arctic: 'ridge' }[key] || 'mountain';
    n('base', source, 40, 90, key === 'island' ? { seed: 18, scale: 3.6, radius: .9 } : key === 'arctic' ? { seed: 137, scale: 3.2, height: 1.05 } : key === 'desert' ? { height: .65, scale: 4.5 } : {});
    if (key === 'canyon') {
        n('shape', 'terrace', 270, 90, { steps: 14, softness: .4 });
        e('base', 'shape');
    }
    else {
        n('shape', 'warp', 270, 90, { strength: key === 'desert' ? .015 : .025, scale: 7.5 });
        e('base', 'shape');
    }
    n('erode', key === 'desert' ? 'thermal' : 'hydraulic', 500, 90, key === 'desert' ? { iterations: 12, talus: 38 } : key === 'volcano' ? { iterations: 65, rain: .003 } : key === 'canyon' ? { iterations: 65, erosion: .1 } : { iterations: 100 });
    e('shape', 'erode');
    n('surface', 'biome', 750, 90, { palette: p.view.palette, snowLine: p.view.snowLine });
    e('erode', 'surface');
    n('out', 'output', 1000, 90);
    e('surface', 'out');
    n('slope', 'slope', 500, 330);
    e('erode', 'slope');
    n('altitude', 'height', 750, 330, { low: .5, high: 1 });
    e('erode', 'altitude');
    return p;
}
