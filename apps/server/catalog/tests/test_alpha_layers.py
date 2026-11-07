"""Mannequin (alpha) engine on synthetic photos: alignment, layer cutting, checks and stacking order."""
import numpy as np
import pytest
from PIL import Image

from catalog.engine import alpha_layers as al
from catalog.engine.cutout import cloth_masks_from_predict

from .alpha_fixtures import (
    BLAZER, CAP, EYEWEAR, KURTA, SHOES, TEE, TROUSERS, WIDE_BOTTOM, WRIST,
    cloth_masks, fake_segment, person,
)

BASE = person()
BASE_CLOTH = cloth_masks()


def inside(alpha, box, pad=6):
    x0, y0, x1, y1 = box
    return alpha[y0 + pad:y1 - pad, x0 + pad:x1 - pad]


def test_to_canvas_resizes_a_3_4_photo_and_pads_other_shapes():
    assert al.to_canvas(Image.new("RGB", (1792, 2400), "red")).shape == (1280, 960, 3)
    padded = al.to_canvas(Image.new("RGB", (1000, 1000), (10, 20, 30)))
    assert padded.shape == (1280, 960, 3)
    assert tuple(padded[0, 0]) == (10, 20, 30)


def test_align_recovers_a_small_shift():
    render = person(top=(200, 40, 40), shift=(4, -3))
    aligned, report = al.align(BASE, render)
    assert report.ecc is not None and report.ecc > 0.9
    assert abs(report.shift_x - 4) < 1.0 and abs(report.shift_y + 3) < 1.0
    # after alignment the untouched head matches the base again
    x0, y0, x1, y1 = (440, 90, 520, 190)
    assert al.delta_e(BASE[y0:y1, x0:x1], aligned[y0:y1, x0:x1]).mean() < 6


def test_a_shirt_layer_covers_the_shirt_and_nothing_else():
    render = person(top=(200, 40, 40), shift=(2, 1))
    layer, report = al.make_layer(BASE, render, "top", BASE_CLOTH, fake_segment())
    alpha = layer[..., 3]
    assert al.problems(report) == []
    assert (inside(alpha, TEE) > 0).mean() > 0.95
    assert (inside(alpha, TROUSERS) == 0).mean() > 0.95
    assert alpha[:200].max() == 0  # head untouched
    assert (layer[..., :3][alpha == 0] == 0).all()  # transparent pixels carry no colour


def test_a_trouser_layer_reaches_up_under_the_tee_hem():
    render = person(bottom=(30, 60, 120))
    layer, report = al.make_layer(BASE, render, "bottom", BASE_CLOTH, fake_segment())
    alpha = layer[..., 3]
    assert al.problems(report) == []
    assert (inside(alpha, TROUSERS) > 0).mean() > 0.95
    # the waist extension: the bottom rows of the tee are covered with trouser colour
    hem = layer[TEE[3] - 30:TEE[3] - 2, TROUSERS[0] + 10:TROUSERS[2] - 10]
    assert (hem[..., 3] > 0).all()
    assert abs(hem[..., 2].astype(int).mean() - 120) < 20  # blue channel of the new trousers


def test_a_kurta_reaches_below_the_tee_and_covers_the_trouser_top():
    render = person(kurta=(150, 40, 70))
    # lower overlaps the kurta on purpose: a kurta covers the trouser top and must not be cut away by it
    segment = fake_segment(full_box=KURTA, carve_lower=False)
    layer, report = al.make_layer(BASE, render, "kurta", BASE_CLOTH, segment)
    alpha = layer[..., 3]
    assert al.problems(report) == []
    assert (alpha[660:780, TROUSERS[0] + 10:TROUSERS[2] - 10] > 0).mean() > 0.95
    assert alpha[1000:, :].max() == 0  # trousers well below the kurta stay untouched


def test_an_open_blazer_leaves_the_tee_between_its_panels_transparent():
    render = person(blazer=(60, 60, 140))
    layer, report = al.make_layer(BASE, render, "outerwear", BASE_CLOTH, fake_segment())
    alpha = layer[..., 3]
    assert al.problems(report) == []
    assert report.components == 2
    assert (inside(alpha, BLAZER[0], pad=8) > 0).mean() > 0.9
    assert (inside(alpha, BLAZER[1], pad=8) > 0).mean() > 0.9
    assert alpha[300:500, 430:530].max() == 0  # open front: the chosen shirt shows through


def test_a_wide_bottom_is_not_clipped_by_the_base_trousers():
    render = person(bottom=(30, 80, 150), bottom_box=WIDE_BOTTOM)
    # the cloth mask is the narrow base trousers; the changed wide pixels must survive the wider dilation
    layer, report = al.make_layer(BASE, render, "bottom", BASE_CLOTH, fake_segment(lower_box=TROUSERS))
    alpha = layer[..., 3]
    assert al.problems(report) == []
    assert alpha[900, 350] > 0 and alpha[900, 610] > 0


def test_sunglasses_and_a_cap_are_cut_inside_their_head_bands():
    glasses, glasses_report = al.make_layer(
        BASE, person(eyewear=(20, 20, 20)), "eyewear", BASE_CLOTH, fake_segment(),
    )
    assert al.problems(glasses_report) == []
    assert (inside(glasses[..., 3], EYEWEAR, pad=5) > 0).mean() > 0.9
    assert glasses[..., 3][330:].max() == 0

    cap, cap_report = al.make_layer(BASE, person(cap=(40, 70, 170)), "headwear", BASE_CLOTH, fake_segment())
    assert al.problems(cap_report) == []
    assert (inside(cap[..., 3], CAP, pad=5) > 0).mean() > 0.9
    assert cap[..., 3][260:].max() == 0


def test_outerwear_problems_accept_one_part_but_not_zero():
    report = al.LayerReport(
        slot="outerwear", ecc=1.0, shift_x=0.0, shift_y=0.0, scale=1.0,
        layer_share=0.01, keep_change=0.0, components=1,
    )
    assert al.problems(report) == []
    report.components = 0
    assert any("part" in reason for reason in al.problems(report))


def test_shoes_are_two_parts_and_a_watch_is_one():
    _, shoes = al.make_layer(BASE, person(shoes=(90, 50, 30)), "shoes", BASE_CLOTH, fake_segment())
    assert shoes.components == 2 and al.problems(shoes) == []
    watch_layer, watch = al.make_layer(BASE, person(watch=(20, 20, 20)), "watch", BASE_CLOTH, fake_segment())
    assert watch.components == 1 and al.problems(watch) == []
    assert (inside(watch_layer[..., 3], WRIST, pad=4) > 0).mean() > 0.9


def test_a_render_where_the_person_moved_is_rejected():
    moved = person(top=(200, 40, 40), shift=(60, 0))
    _, report = al.make_layer(BASE, moved, "top", BASE_CLOTH, fake_segment())
    assert al.problems(report)


def test_a_render_with_no_change_is_rejected():
    _, report = al.make_layer(BASE, person(), "watch", BASE_CLOTH, fake_segment())
    assert any("no change" in reason or "part" in reason for reason in al.problems(report))


def test_composite_draws_top_over_bottom_over_shoes():
    def solid(box, colour):
        layer = np.zeros((*BASE.shape[:2], 4), np.uint8)
        x0, y0, x1, y1 = box
        layer[y0:y1, x0:x1] = (*colour, 255)
        return layer

    overlap = (400, 600, 500, 700)
    out = al.composite(BASE, [("top", solid(overlap, (255, 0, 0))), ("bottom", solid(overlap, (0, 0, 255)))])
    assert tuple(out[650, 450]) == (255, 0, 0)
    out = al.composite(BASE, [("bottom", solid(overlap, (0, 0, 255))), ("shoes", solid(overlap, (0, 255, 0)))])
    assert tuple(out[650, 450]) == (0, 0, 255)


def test_z_order_puts_outerwear_over_kurta_and_eyewear_over_lower_layers():
    def solid(box, colour):
        layer = np.zeros((*BASE.shape[:2], 4), np.uint8)
        x0, y0, x1, y1 = box
        layer[y0:y1, x0:x1] = (*colour, 255)
        return layer

    overlap = (400, 600, 500, 700)
    out = al.composite(BASE, [("kurta", solid(overlap, (0, 0, 255))), ("outerwear", solid(overlap, (255, 0, 0)))])
    assert tuple(out[650, 450]) == (255, 0, 0)

    below = [
        ("bottom", solid(overlap, (255, 0, 255))),
        ("top", solid(overlap, (0, 255, 255))),
        ("kurta", solid(overlap, (0, 0, 255))),
        ("outerwear", solid(overlap, (255, 0, 0))),
        ("watch", solid(overlap, (255, 255, 0))),
    ]
    out = al.composite(BASE, [*below, ("eyewear", solid(overlap, (0, 255, 0)))])
    assert tuple(out[650, 450]) == (0, 255, 0)


def test_base_top_redraws_the_tee_unchanged():
    base_top, _ = al.build_layer(BASE, BASE, "base_top", BASE_CLOTH, BASE_CLOTH)
    out = al.composite(BASE, [("base_top", base_top)])
    assert np.abs(out.astype(int) - BASE.astype(int)).max() <= 1


def test_layer_cutting_accepts_an_old_two_mask_cloth_result():
    old_masks = BASE_CLOTH[:2]
    base_top, _ = al.build_layer(BASE, BASE, "base_top", old_masks, old_masks)
    out = al.composite(BASE, [("base_top", base_top)])
    assert np.abs(out.astype(int) - BASE.astype(int)).max() <= 1


def test_cloth_masks_come_from_all_three_predict_masks():
    upper = Image.new("L", (4, 4), 0)
    upper.putpixel((1, 1), 255)
    lower = Image.new("L", (4, 4), 255)
    full = Image.new("L", (4, 4), 0)
    full.putpixel((2, 2), 255)
    up, low, whole = cloth_masks_from_predict([upper, lower, full])
    assert up.sum() == 1 and up[1, 1] and low.all()
    assert whole.sum() == 1 and whole[2, 2]
    up2, low2, whole2 = cloth_masks_from_predict([upper, lower])
    assert up2.sum() == 1 and low2.all() and not whole2.any()
    with pytest.raises(ValueError):
        cloth_masks_from_predict([upper])


@pytest.mark.models
def test_the_real_cloth_model_returns_three_masks_of_the_image_size():
    from django.conf import settings

    from catalog.engine.cutout import cloth_segmenter

    weights = settings.ML_MODELS_DIR / "rembg" / "models" / "u2net_cloth_seg" / "u2net_cloth_seg.onnx"
    if not weights.exists():
        pytest.skip("models missing: run `make models`")
    upper, lower, full = cloth_segmenter(model_dir=settings.ML_MODELS_DIR / "rembg")(BASE)
    assert upper.shape == lower.shape == full.shape == BASE.shape[:2]
    assert upper.dtype == bool and lower.dtype == bool and full.dtype == bool
