"""Independent interoperability checks. Optional dependencies: Pillow, NumPy, OpenCV, trimesh.
Run after `node scripts/generate-examples.mjs`. Does not use TerraWeave decoders.
"""
import json, os, zipfile
from pathlib import Path
os.environ['OPENCV_IO_ENABLE_OPENEXR'] = '1'
import numpy as np
from PIL import Image
import cv2
import trimesh
root = Path(__file__).resolve().parents[1]
fixtures = root / 'examples' / 'exports'
raw = np.fromfile(fixtures / 'alpine-height.r32', dtype='<f4').reshape(128, 128)
checks = []
image = np.asarray(Image.open(fixtures / 'alpine-height.png'))
assert image.shape == raw.shape and image.max() > 255
assert np.max(np.abs(image / 65535 - np.clip(raw, 0, 1))) <= 1 / 65535
checks.append('Pillow reads genuine 16-bit PNG; values agree within one quantization level')
exr = cv2.imread(str(fixtures / 'alpine-height.exr'), cv2.IMREAD_UNCHANGED)
assert exr is not None and exr.dtype == np.float32 and exr.shape == raw.shape
assert np.array_equal(exr, raw)
checks.append('OpenCV OpenEXR reader recovers exact FLOAT height samples')
with zipfile.ZipFile(fixtures / 'alpine-assets.zip') as archive:
    assert archive.testzip() is None
    names = archive.namelist()
    assert {'height.png', 'height.r32', 'normals.png', 'metadata.json', 'project.terraweave.json'} <= set(names)
    assert np.array_equal(np.frombuffer(archive.read('height.r32'), dtype='<f4').reshape(raw.shape), raw)
checks.append('Python zipfile verifies every ZIP member CRC and unmodified RAW samples')
for suffix in ['glb', 'obj']:
    mesh = trimesh.load(fixtures / ('alpine-terrain.' + suffix), force='mesh', process=False)
    assert mesh.vertices.shape == (4225, 3) and mesh.faces.shape == (8192, 3)
    assert np.isfinite(mesh.vertices).all()
    assert np.allclose(mesh.bounds[:, [0, 2]], [[-2000, -2000], [2000, 2000]])
    checks.append('trimesh loads ' + suffix.upper() + ' with 4,225 vertices, 8,192 triangles and correct meter bounds')
report = {'passed': len(checks), 'checks': checks}
(root / 'tests/external-results.json').write_text(json.dumps(report, indent=2))
print(json.dumps(report, indent=2))
