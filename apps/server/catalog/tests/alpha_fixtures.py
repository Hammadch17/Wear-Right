"""Synthetic 'person' photos for the Mannequin (alpha) tests: a textured backdrop, a head, a white tee,
grey trousers and white shoes, plus helpers to make one-item-swapped renders of it. No real photos."""
import numpy as np
from PIL import Image

W, H = 960, 1280
HEAD = (430, 80, 530, 200)        # x0, y0, x1, y1
TEE = (360, 220, 600, 640)
KURTA = (360, 220, 600, 900)      # reaches mid-thigh, below the tee hem
TROUSERS = (380, 620, 580, 1130)
WIDE_BOTTOM = (340, 620, 620, 1130)  # patiala/skirt wider than the base trousers
SHOES = [(370, 1130, 470, 1180), (490, 1130, 590, 1180)]
WRIST = (605, 600, 640, 640)
EYEWEAR = (420, 120, 540, 175)
CAP = (420, 50, 540, 140)
BLAZER = [(340, 235, 410, 610), (550, 235, 620, 610)]  # two open panels around the tee
ARMS = [(320, 230, 360, 640), (600, 230, 640, 640)]


def _box(mask, box, value=True):
    x0, y0, x1, y1 = box
    mask[y0:y1, x0:x1] = value


def _noise(seed, shape, amount=10):
    return np.random.default_rng(seed).integers(-amount, amount + 1, size=shape)


def person(
    *, top=None, top_box=TEE, bottom=None, bottom_box=TROUSERS, shoes=None, watch=None,
    kurta=None, kurta_box=KURTA, blazer=None, eyewear=None, cap=None, shift=(0, 0), seed=1,
):
    """RGB uint8 array. Colours replace one item each; `shift` moves everything (a badly aligned render)."""
    image = np.full((H, W, 3), 205, np.int32) + _noise(seed, (H, W, 3), 6)  # backdrop with grain for ECC
    ramp = np.linspace(-15, 15, H)[:, None, None]
    image = image + ramp.astype(np.int32)
    texture = _noise(seed + 1, (H, W, 3), 4)

    def paint(box, colour):
        x0, y0, x1, y1 = box
        image[y0:y1, x0:x1] = np.array(colour) + texture[y0:y1, x0:x1]

    for arm in ARMS:
        paint(arm, (150, 105, 80))
    paint(HEAD, (150, 105, 80))
    paint(bottom_box, bottom or (120, 120, 125))
    paint(top_box if top else TEE, top or (245, 245, 245))
    if kurta:
        paint(kurta_box, kurta)
    for panel in BLAZER:
        if blazer:
            paint(panel, blazer)
    for foot in SHOES:
        paint(foot, shoes or (240, 240, 240))
    if watch:
        paint(WRIST, watch)
    if eyewear:
        paint(EYEWEAR, eyewear)
    if cap:
        paint(CAP, cap)
    out = np.clip(image, 0, 255).astype(np.uint8)
    if shift != (0, 0):
        out = np.roll(out, shift=(shift[1], shift[0]), axis=(0, 1))
    return out


def cloth_masks(*, top_box=TEE, lower_box=TROUSERS, full_box=None, carve_lower=True):
    """(upper, lower, full) masks the way the cloth model would see this synthetic person."""
    upper = np.zeros((H, W), bool)
    lower = np.zeros((H, W), bool)
    full = np.zeros((H, W), bool)
    _box(upper, top_box)
    _box(lower, lower_box)
    if full_box:
        _box(full, full_box)
    if carve_lower:
        lower &= ~upper
    return upper, lower, full


def fake_segment(**kwargs):
    return lambda image: cloth_masks(**kwargs)


def save_png(array, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(array).save(path)
    return path
