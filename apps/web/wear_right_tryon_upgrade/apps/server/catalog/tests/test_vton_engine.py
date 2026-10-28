"""Unit tests for the Wear Right 3-Tier Virtual Try-On & Pose Warping Engine."""
from PIL import Image, ImageDraw

from catalog.engine.vton import (
    DEFAULT_STUDIO_POSE,
    cache_key_for,
    slot_to_vton_category,
    warp_garment_to_pose,
)


def test_slot_to_vton_category():
    assert slot_to_vton_category("top") == "tops"
    assert slot_to_vton_category("outerwear") == "tops"
    assert slot_to_vton_category("bottom") == "bottoms"
    assert slot_to_vton_category("kurta") == "one-pieces"


def test_cache_key_deterministic():
    k1 = cache_key_for(b"person-a", b"cloth-1", "tops")
    k2 = cache_key_for(b"person-a", b"cloth-1", "tops")
    k3 = cache_key_for(b"person-a", b"cloth-2", "tops")
    assert k1 == k2
    assert k1 != k3
    assert len(k1) == 24


def test_warp_garment_to_pose_creates_valid_rgb_composite():
    person = Image.new("RGB", (300, 400), (235, 232, 228))
    garment = Image.new("RGBA", (200, 240), (0, 0, 0, 0))
    draw = ImageDraw.Draw(garment)
    draw.rectangle([20, 20, 180, 220], fill=(85, 107, 47, 255))

    result = warp_garment_to_pose(person, garment, slot="outerwear", keypoints=DEFAULT_STUDIO_POSE)
    assert result.mode == "RGB"
    assert result.size == (300, 400)
    # Center chest pixel should now carry the olive blazer color rather than the plain backdrop
    chest_pixel = result.getpixel((150, 130))
    assert chest_pixel != (235, 232, 228)
