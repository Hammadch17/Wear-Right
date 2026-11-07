"""Mannequin (alpha): importing a render kit into layers, and the wardrobe API the dressing room reads."""
import csv
import io

import pytest
from django.core.management import call_command

from catalog.alpha_services import import_alpha_kit
from catalog.models import MannequinBase, MannequinLayer
from core.tests.factories import ProductFactory

from .alpha_fixtures import fake_segment, person, save_png

pytestmark = pytest.mark.django_db
URL = "/api/mannequin/alpha/"


@pytest.fixture(autouse=True)
def media_root(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path / "media"
    return settings.MEDIA_ROOT


ROWS = [
    ("T1", "9001", "top", "renders/T1_9001.png", dict(top=(200, 40, 40), shift=(2, 1))),
    ("B1", "9002", "bottom", "renders/B1_9002.png", dict(bottom=(30, 60, 120))),
    ("S1", "9003", "shoes", "renders/S1_9003.png", dict(shoes=(90, 50, 30))),
    ("W1", "9004", "watch", "renders/W1_9004.png", dict(watch=(20, 20, 20))),
]


def make_kit(root, rows=ROWS, extra_manifest=()):
    save_png(person(), root / "base" / "men.png")
    for _, _, _, render_file, colours in rows:
        save_png(person(**colours), root / render_file)
    with (root / "manifest.csv").open("w", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["code", "external_id", "slot", "product", "ref_file", "render_file", "status", "tries", "notes"])
        for code, external_id, slot, render_file, _ in rows:
            writer.writerow([code, external_id, slot, "", "", render_file, "done", "1", ""])
        for row in extra_manifest:
            writer.writerow(row)
    return root


def make_gendered_kit(root, rows, base_gender="men"):
    """A kit with the new `gender` column. Rows are (code, gender, external_id, product_name, slot, render_file, colours)."""
    save_png(person(), root / "base" / f"{base_gender}.png")
    for _, _, _, _, _, render_file, colours in rows:
        save_png(person(**colours), root / render_file)
    with (root / "manifest.csv").open("w", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow([
            "code", "gender", "external_id", "product_name", "slot",
            "product", "ref_file", "render_file", "status", "tries", "notes",
        ])
        for code, gender, external_id, product_name, slot, render_file, _ in rows:
            writer.writerow([code, gender, external_id, product_name, slot, "", "", render_file, "done", "1", ""])
    return root


def products():
    return {
        external_id: ProductFactory(external_id=external_id, gender="men", name=f"Item {code}")
        for code, external_id, *_ in ROWS
    }


def test_import_creates_the_base_and_one_approved_layer_per_render(tmp_path, media_root):
    made = products()
    result = import_alpha_kit(source_dir=make_kit(tmp_path / "kit"), gender="men", segment=fake_segment())

    assert result.base_created
    assert [row.outcome for row in result.rows] == ["approved"] * 4, [row.reason for row in result.rows]
    base = MannequinBase.objects.get(gender="men")
    assert (media_root / base.image.name).exists()
    assert base.base_top and base.base_bottom
    layers = MannequinLayer.objects.filter(base=base)
    assert {layer.product_id for layer in layers} == {product.id for product in made.values()}
    assert all(layer.approved and (media_root / layer.image.name).exists() for layer in layers)
    assert layers.get(slot="top").report["ecc"] > 0.9


def test_a_second_import_skips_unchanged_renders_and_rebuild_recuts_them(tmp_path):
    products()
    kit = make_kit(tmp_path / "kit")
    import_alpha_kit(source_dir=kit, gender="men", segment=fake_segment())

    again = import_alpha_kit(source_dir=kit, gender="men", segment=fake_segment())
    assert not again.base_changed
    assert [row.outcome for row in again.rows] == ["unchanged"] * 4

    rebuilt = import_alpha_kit(source_dir=kit, gender="men", segment=fake_segment(), rebuild=True)
    assert [row.outcome for row in rebuilt.rows] == ["approved"] * 4
    assert MannequinLayer.objects.count() == 4


def test_unknown_products_wrong_gender_missing_files_and_moved_renders_are_reported(tmp_path):
    products()
    ProductFactory(external_id="9100", gender="women")
    moved = [("T9", "9001", "top", "renders/T9_moved.png", dict(top=(200, 40, 40), shift=(60, 0)))]
    kit = make_kit(tmp_path / "kit", rows=moved, extra_manifest=[
        ["X1", "nope", "top", "", "", "renders/T9_moved.png", "", "", ""],
        ["X2", "9100", "top", "", "", "renders/T9_moved.png", "", "", ""],
        ["X3", "9002", "bottom", "", "", "renders/missing.png", "", "", ""],
        ["X4", "9003", "hat", "", "", "renders/T9_moved.png", "", "", ""],
    ])
    rows = {row.code: row for row in import_alpha_kit(source_dir=kit, gender="men", segment=fake_segment()).rows}

    assert rows["T9"].outcome == "rejected" and rows["T9"].reason
    assert rows["X1"].outcome == "skipped" and "no product" in rows["X1"].reason
    assert rows["X2"].outcome == "skipped" and "women" in rows["X2"].reason
    assert rows["X3"].outcome == "skipped" and "not found" in rows["X3"].reason
    assert rows["X4"].outcome == "skipped" and "slot" in rows["X4"].reason
    assert not MannequinLayer.objects.get(product__external_id="9001").approved


def test_the_command_prints_one_line_per_render(tmp_path, monkeypatch):
    products()
    monkeypatch.setattr("catalog.management.commands.import_alpha_mannequin.cloth_segmenter", lambda **_: fake_segment())
    out = io.StringIO()
    call_command("import_alpha_mannequin", source=str(make_kit(tmp_path / "kit")), stdout=out)
    text = out.getvalue()
    assert "Created the men base." in text
    assert "Approved 4, unchanged 0, rejected 0, skipped 0." in text


def test_the_wardrobe_api_is_empty_before_an_import(api_client):
    response = api_client.get(URL)
    assert response.status_code == 200
    assert response.json() == {"status": "success", "gender": "men", "base": None, "z_order": response.json()["z_order"], "slots": []}


def test_the_wardrobe_api_lists_approved_layers_by_slot(api_client, tmp_path):
    made = products()
    made["9004"].status = "Draft"
    made["9004"].save()
    import_alpha_kit(source_dir=make_kit(tmp_path / "kit"), gender="men", segment=fake_segment())
    MannequinLayer.objects.filter(product=made["9003"]).update(approved=False)

    body = api_client.get(URL, {"gender": "men"}).json()

    assert body["status"] == "success"
    assert body["base"]["image"].startswith("/media/mannequin_alpha/base/")
    assert body["base"]["width"] == 960 and body["base"]["height"] == 1280
    assert body["base"]["base_top"] and body["base"]["base_bottom"]
    assert body["z_order"]["top"] > body["z_order"]["bottom"] > body["z_order"]["shoes"]
    slots = {slot["slot"]: slot for slot in body["slots"]}
    assert list(slots) == ["top", "bottom", "watch"]  # shoes layer not approved: no shoes row
    assert slots["top"]["label"] == "Shirts"
    item = slots["top"]["items"][0]
    assert set(item) == {"product_id", "name", "price", "image", "layer", "available"}
    assert item["product_id"] == made["9001"].id and item["available"] is True
    assert item["layer"].startswith("/media/mannequin_alpha/layers/")
    assert slots["watch"]["items"][0]["available"] is False  # Draft: shown, but not linked


def test_the_wardrobe_api_rejects_an_unknown_gender(api_client):
    assert api_client.get(URL, {"gender": "kids"}).status_code == 400


def test_import_only_processes_rows_for_the_requested_gender(tmp_path):
    men = ProductFactory(external_id="9401", gender="men", name="Men Shirt")
    women = ProductFactory(external_id="9402", gender="women", name="Women Shirt")
    old = ProductFactory(external_id="9403", gender="men", name="Old Shirt")
    rows = [
        ("M1", "men", "9401", "", "top", "renders/M1.png", dict(top=(200, 40, 40))),
        ("W1", "women", "9402", "", "top", "renders/W1.png", dict(top=(40, 100, 200))),
        ("O1", "", "9403", "", "top", "renders/O1.png", dict(top=(40, 160, 80))),
    ]

    men_result = import_alpha_kit(
        source_dir=make_gendered_kit(tmp_path / "men-kit", rows), gender="men", segment=fake_segment(),
    )
    assert [row.code for row in men_result.rows] == ["M1", "O1"]  # empty gender means men
    assert {row.product_id for row in men_result.rows} == {men.id, old.id}
    assert MannequinLayer.objects.filter(base__gender="men").count() == 2

    women_result = import_alpha_kit(
        source_dir=make_gendered_kit(tmp_path / "women-kit", rows, base_gender="women"),
        gender="women",
        segment=fake_segment(),
    )
    assert [row.code for row in women_result.rows] == ["W1"]
    assert women_result.rows[0].product_id == women.id
    assert MannequinLayer.objects.filter(base__gender="women").count() == 1


def test_a_missing_external_id_falls_back_to_the_product_name(tmp_path):
    product = ProductFactory(external_id=None, gender="men", name="Black Formal Trouser")
    rows = [
        ("N1", "men", "", "black formal trouser", "top", "renders/N1.png", dict(top=(30, 30, 30))),
    ]

    result = import_alpha_kit(
        source_dir=make_gendered_kit(tmp_path / "kit", rows), gender="men", segment=fake_segment(),
    )

    row = result.rows[0]
    assert row.outcome == "approved"
    assert row.product_id == product.id
    assert "matched product_name 'Black Formal Trouser'" in row.reason


def test_an_ambiguous_product_name_is_skipped(tmp_path):
    ProductFactory(external_id=None, gender="men", name="Twin Shirt")
    ProductFactory(external_id=None, gender="men", name="Twin Shirt")
    rows = [
        ("A1", "men", "", "Twin Shirt", "top", "renders/A1.png", dict(top=(200, 100, 0))),
    ]

    result = import_alpha_kit(
        source_dir=make_gendered_kit(tmp_path / "kit", rows), gender="men", segment=fake_segment(),
    )

    assert result.rows[0].outcome == "skipped"
    assert "ambiguous product_name 'Twin Shirt'" in result.rows[0].reason
    assert MannequinLayer.objects.count() == 0


def test_the_new_slots_are_accepted_by_the_importer(tmp_path):
    rows = [
        ("K1", "men", "9501", "", "kurta", "renders/K1.png", dict(kurta=(150, 40, 70))),
        ("O1", "men", "9502", "", "outerwear", "renders/O1.png", dict(blazer=(60, 60, 140))),
        ("E1", "men", "9503", "", "eyewear", "renders/E1.png", dict(eyewear=(20, 20, 20))),
        ("H1", "men", "9504", "", "headwear", "renders/H1.png", dict(cap=(40, 70, 170))),
    ]
    for code, external_id, name in [
        ("K1", "9501", "Kurta"), ("O1", "9502", "Blazer"),
        ("E1", "9503", "Sunglasses"), ("H1", "9504", "Cap"),
    ]:
        ProductFactory(external_id=external_id, gender="men", name=name)

    result = import_alpha_kit(
        source_dir=make_gendered_kit(tmp_path / "kit", rows), gender="men", segment=fake_segment(),
    )

    assert [row.outcome for row in result.rows] == ["approved"] * 4, [row.reason for row in result.rows]
    assert {row.slot for row in result.rows} == {"kurta", "outerwear", "eyewear", "headwear"}
    assert set(MannequinLayer.objects.values_list("slot", flat=True)) == {
        "kurta", "outerwear", "eyewear", "headwear",
    }
