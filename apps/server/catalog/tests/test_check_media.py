import io

import pytest
from django.core.management import call_command

from catalog.models import MannequinBase, MannequinLayer
from core.tests.factories import ProductFactory

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def media_root(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path / "media"
    return settings.MEDIA_ROOT


def _run(**options):
    out, err = io.StringIO(), io.StringIO()
    call_command("check_media", stdout=out, stderr=err, **options)
    return out.getvalue(), err.getvalue()


def _product_with_missing(field, reference, **kwargs):
    product = ProductFactory(**kwargs)
    setattr(product, field, reference)  # a reference whose file was never written
    product.save()
    return product


def test_missing_files_are_listed_with_counts():
    shirt = _product_with_missing("image", "products/gone.png")
    kurta = _product_with_missing(
        "mannequin_image", "products/mannequin/gone-cutout.png", mannequin_ready=True, name="Lost Kurta"
    )

    out, _ = _run()

    assert f'product {shirt.pk} "{shirt.name}" image: products/gone.png' in out
    assert f'product {kurta.pk} "Lost Kurta" mannequin_image: products/mannequin/gone-cutout.png' in out
    assert "2 missing media files (image=1, mannequin_image=1)." in out


def test_files_that_exist_are_not_reported(media_root):
    product = ProductFactory(name="Present")
    product.image.name = "products/here.png"
    product.save()
    target = media_root / "products"
    target.mkdir(parents=True)
    (target / "here.png").write_bytes(b"png bytes")

    out, _ = _run()

    assert "Every product photo exists on disk." in out
    product.refresh_from_db()
    assert product.image.name == "products/here.png"


def test_fix_clears_missing_references_but_keeps_real_files(media_root):
    broken_shirt = _product_with_missing("image", "products/gone.png")
    broken_kurta = _product_with_missing(
        "mannequin_image", "products/mannequin/gone.png", mannequin_ready=True
    )
    healthy = _product_with_missing("image", "products/kept.png")
    target = media_root / "products"
    target.mkdir(parents=True)
    (target / "kept.png").write_bytes(b"png bytes")

    out, _ = _run(fix=True)

    broken_shirt.refresh_from_db()
    broken_kurta.refresh_from_db()
    healthy.refresh_from_db()
    assert broken_shirt.image.name == ""
    assert broken_kurta.mannequin_image.name == ""
    assert broken_kurta.mannequin_ready is False
    assert healthy.image.name == "products/kept.png"
    assert "Cleared 2 dead references." in out


def test_missing_mannequin_images_are_reported_and_never_cleared():
    base = MannequinBase.objects.create(gender="men", image="mannequin_alpha/base/gone.jpg")
    layer = MannequinLayer.objects.create(
        base=base,
        product=ProductFactory(name="Layer Shirt"),
        slot="top",
        image="mannequin_alpha/layers/gone.png",
        image_dark="mannequin_alpha/layers/gone-dark.png",
    )

    out, _ = _run(fix=True)

    assert "Every product photo exists on disk." in out
    assert "mannequin base men image: mannequin_alpha/base/gone.jpg" in out
    assert f'layer {layer.pk} "Layer Shirt" image: mannequin_alpha/layers/gone.png' in out
    assert f'layer {layer.pk} "Layer Shirt" image_dark: mannequin_alpha/layers/gone-dark.png' in out
    assert "3 missing mannequin image(s)." in out
    base.refresh_from_db()
    layer.refresh_from_db()
    assert base.image.name == "mannequin_alpha/base/gone.jpg"
    assert layer.image.name == "mannequin_alpha/layers/gone.png"
