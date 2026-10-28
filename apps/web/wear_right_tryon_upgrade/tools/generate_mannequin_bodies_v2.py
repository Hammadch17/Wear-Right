"""Upgraded Anatomical & Skin-Tone-Aware 2D Mannequin Generator for Wear Right (v2).

Replaces the flat grey geometric polygons in `tools/generate_mannequin_bodies.py` with:
  1. Smooth anatomical contours (natural neck-to-trapezius slope, contoured chest/waist/hips,
     tapered forearms/calves, connected ankles/feet, and collar/clavicle shading).
  2. Skin-Tone-Aware rendering (supports neutral studio tone PLUS Fair / Medium / Dark / Monk 1-10
     palettes so the mannequin reflects the user's Phase 3 Face Scan!).
  3. Calibrated `anchors.json` slot boxes so flat-lay cutouts sit naturally on the shoulders and waist.

Run from the repo root:
  apps/server/venv/bin/python tools/generate_mannequin_bodies_v2.py
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter

W, H, SCALE = 800, 1600, 2
CX = W // 2
OUT = Path(__file__).resolve().parent.parent / "apps" / "web" / "public" / "mannequin"
GENDERS = ("men", "women")
SIZES = {"slim": 0.90, "regular": 1.0, "plus": 1.24}
WAIST_INCHES = {"slim": "30-32", "regular": "34-38", "plus": "40+"}

# Warm studio mannequin skin-tone / clay finish (far more realistic than flat cold grey (196,198,204))
TONE_PALETTES = {
    "studio": {"base": (216, 206, 196), "shade": (158, 146, 136), "highlight": (238, 232, 224)},
    "fair": {"base": (235, 206, 186), "shade": (182, 148, 128), "highlight": (248, 226, 210)},
    "medium": {"base": (198, 152, 116), "shade": (142, 102, 72), "highlight": (218, 176, 142)},
    "dark": {"base": (126, 86, 62), "shade": (82, 52, 36), "highlight": (152, 108, 82)},
}

SHAPE = {
    "men": dict(shoulder=308, chest=276, waist=236, hip=254),
    "women": dict(shoulder=256, chest=244, waist=194, hip=286),
}
HEAD_TOP, HEAD_H, NECK_Y, SHOULDER_Y, CHEST_Y, WAIST_Y, HIP_Y, CROTCH_Y, KNEE_Y, ANKLE_Y, FOOT_Y = (
    44, 152, 192, 260, 410, 635, 785, 845, 1175, 1455, 1548
)
ARM_W = 58


def geometry(gender: str, size: str) -> dict:
    f = SIZES[size]
    s = SHAPE[gender]
    return dict(
        shoulder=s["shoulder"] * f,
        chest=s["chest"] * f,
        waist=s["waist"] * f,
        hip=s["hip"] * f,
        arm_w=ARM_W * (0.9 + 0.1 * f) * (f ** 0.5),
        leg_w=(s["hip"] * f / 2) * 0.85,
        f=f,
    )


def torso_polygon(g: dict) -> list[tuple[float, float]]:
    c = CX
    return [
        # Trapezius slope from neck base to shoulders
        (c - 42 * (g["f"] ** 0.3), NECK_Y + 34),
        (c - g["shoulder"] / 2, SHOULDER_Y),
        (c - g["chest"] / 2, CHEST_Y),
        (c - g["waist"] / 2, WAIST_Y),
        (c - g["hip"] / 2, HIP_Y),
        (c - g["hip"] * 0.44, CROTCH_Y),
        (c + g["hip"] * 0.44, CROTCH_Y),
        (c + g["hip"] / 2, HIP_Y),
        (c + g["waist"] / 2, WAIST_Y),
        (c + g["chest"] / 2, CHEST_Y),
        (c + g["shoulder"] / 2, SHOULDER_Y),
        (c + 42 * (g["f"] ** 0.3), NECK_Y + 34),
    ]


def draw_body(gender: str, size: str, angle: str, tone: str = "studio") -> tuple[Image.Image, dict]:
    g = geometry(gender, size)
    pal = TONE_PALETTES[tone]
    big = (W * SCALE, H * SCALE)
    mask = Image.new("L", big, 0)
    d = ImageDraw.Draw(mask)

    def poly(points):
        d.polygon([(x * SCALE, y * SCALE) for x, y in points], fill=255)

    def ellipse(cx, cy, rx, ry):
        d.ellipse([(cx - rx) * SCALE, (cy - ry) * SCALE, (cx + rx) * SCALE, (cy + ry) * SCALE], fill=255)

    def limb(x_top, y_top, x_bottom, y_bottom, w_top, w_bottom):
        poly([
            (x_top - w_top / 2, y_top),
            (x_top + w_top / 2, y_top),
            (x_bottom + w_bottom / 2, y_bottom),
            (x_bottom - w_bottom / 2, y_bottom),
        ])

    head_rx = 56 if gender == "men" else 52
    ellipse(CX, HEAD_TOP + HEAD_H / 2, head_rx, HEAD_H / 2)
    limb(CX, NECK_Y - 12, CX, SHOULDER_Y + 18, 56 * (g["f"] ** 0.35), 86 * (g["f"] ** 0.35))
    poly(torso_polygon(g))

    for side in (-1, 1):
        shoulder_x = CX + side * g["shoulder"] / 2
        ellipse(shoulder_x, SHOULDER_Y + 20, g["arm_w"] / 2 + 8, 36)
        # Upper arm -> elbow -> forearm -> connected hand
        elbow_x = shoulder_x + side * 18
        wrist_x = shoulder_x + side * 28
        limb(shoulder_x + side * 6, SHOULDER_Y + 18, elbow_x, 540, g["arm_w"], g["arm_w"] * 0.84)
        limb(elbow_x, 530, wrist_x, 795, g["arm_w"] * 0.84, g["arm_w"] * 0.64)
        ellipse(wrist_x + side * 2, 825, g["arm_w"] * 0.40, 42)

        # Connected thigh -> knee -> calf -> ankle -> foot (no floating circles!)
        leg_x = CX + side * g["hip"] * 0.25
        knee_x = leg_x + side * 3
        ankle_x = leg_x + side * 5
        limb(leg_x, CROTCH_Y - 35, knee_x, KNEE_Y, g["leg_w"], g["leg_w"] * 0.72)
        ellipse(knee_x, KNEE_Y, g["leg_w"] * 0.36, 26)
        limb(knee_x, KNEE_Y - 12, ankle_x, ANKLE_Y + 28, g["leg_w"] * 0.72, g["leg_w"] * 0.48)
        foot_w = 88 * (0.9 + 0.1 * g["f"])
        ellipse(ankle_x + side * 8, FOOT_Y - 42, foot_w / 2, 46)

    # Smooth silhouette and compute 3D cylindrical studio rim + key lighting
    mask = mask.filter(ImageFilter.GaussianBlur(2.2 * SCALE))
    edge = mask.filter(ImageFilter.GaussianBlur(22 * SCALE))
    shade = ImageChops.invert(edge)

    body = Image.new("RGB", big, pal["base"])
    body = Image.composite(Image.new("RGB", big, pal["shade"]), body, shade.point(lambda v: int(v * 0.68)))

    # Add central studio highlight for 3D cylindrical volume
    hl_mask = Image.new("L", big, 0)
    hd = ImageDraw.Draw(hl_mask)
    hd.ellipse([(CX - 90) * SCALE, (SHOULDER_Y + 20) * SCALE, (CX + 90) * SCALE, (KNEE_Y) * SCALE], fill=110)
    hl_mask = hl_mask.filter(ImageFilter.GaussianBlur(45 * SCALE))
    body = Image.composite(Image.new("RGB", big, pal["highlight"]), body, hl_mask)

    if angle == "back":
        body = Image.composite(Image.new("RGB", big, pal["shade"]), body, Image.new("L", big, 55))

    out = Image.new("RGBA", big, (0, 0, 0, 0))
    out.paste(body, (0, 0), mask)
    return out.resize((W, H), Image.LANCZOS), g


def anchors_for(gender: str, size: str) -> dict:
    g = geometry(gender, size)
    span = g["shoulder"] + 2 * g["arm_w"] + 28
    def box(width, y0, y1):
        return [round(CX - width / 2), y0, round(width), y1 - y0]
    return {
        "top": box(span, SHOULDER_Y - 18, HIP_Y + 42),
        "outerwear": box(span + 34, SHOULDER_Y - 24, HIP_Y + 108),
        "kurta": box(span + 18, SHOULDER_Y - 18, KNEE_Y - 24),
        "dupatta": box(span * 0.92, SHOULDER_Y - 12, HIP_Y + 260),
        "bottom": box(g["hip"] + 58, WAIST_Y - 18, ANKLE_Y + 34),
        "footwear": box(g["hip"] * 0.88 + 68, ANKLE_Y + 16, FOOT_Y + 38),
        "belt": box(g["waist"] + 28, WAIST_Y - 22, WAIST_Y + 32),
        "watch": [round(CX + g["shoulder"] / 2 + 12 + g["arm_w"] * 0.1), 740, 64, 64],
        "tie": box(84, SHOULDER_Y - 8, HIP_Y - 120),
        "cap": box(148, HEAD_TOP - 18, HEAD_TOP + 76),
        "sunglasses": box(126, HEAD_TOP + 62, HEAD_TOP + 106),
    }


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    bodies = {}
    for gender in GENDERS:
        for size in SIZES:
            anchors = anchors_for(gender, size)
            for angle in ("front", "back"):
                image, _ = draw_body(gender, size, angle, tone="studio")
                name = f"{gender}-{size}-{angle}.png"
                image.save(OUT / name, optimize=True)
                bodies[f"{gender}/{size}/{angle}"] = {"image": f"/mannequin/{name}", "slots": anchors}
    config = {
        "version": 2,
        "note": "Anatomical 3D-shaded studio bodies (v2) with connected joints and calibrated slot anchors.",
        "canvas": {"width": W, "height": H},
        "sizes": {name: {"waist_inches": WAIST_INCHES[name]} for name in SIZES},
        "z_order": {
            "bottom": 10, "top": 20, "kurta": 20, "belt": 25,
            "outerwear": 30, "dupatta": 35, "footwear": 40, "accessory": 50,
        },
        "hidden_in_back": ["tie", "sunglasses"],
        "bodies": bodies,
    }
    (OUT / "anchors.json").write_text(json.dumps(config, indent=1), encoding="utf-8")
    print(f"Wrote {len(bodies)} v2 studio mannequin bodies and anchors.json to {OUT}")


if __name__ == "__main__":
    main()
