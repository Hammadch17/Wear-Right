from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand

from catalog.models import MannequinBase, MannequinLayer, Product

IMAGE_FIELDS = ("image", "back_image", "mannequin_image")
BASE_IMAGE_FIELDS = ("image", "base_top", "base_bottom", "image_fair", "image_dark")
LAYER_IMAGE_FIELDS = ("image", "image_fair", "image_dark")


class Command(BaseCommand):
    help = (
        "Reports every product photo and mannequin base/layer image whose file is missing on disk. "
        "--fix clears dead product references so the shop shows its placeholder instead of a broken "
        "image; mannequin references are reported only."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--fix",
            action="store_true",
            help="Clear image fields whose file is missing (cut-outs also lose mannequin_ready).",
        )

    def handle(self, *args, **options):
        media_root = Path(settings.MEDIA_ROOT)
        missing = []
        for product in Product.objects.all().iterator():
            for field in IMAGE_FIELDS:
                name = getattr(product, field).name
                if name and not (media_root / name).exists():
                    missing.append((product, field, name))

        if missing:
            for product, field, name in missing:
                self.stdout.write(f'product {product.pk} "{product.name}" {field}: {name}')

            summary = ", ".join(
                f"{field}={sum(1 for _, f, _ in missing if f == field)}"
                for field in IMAGE_FIELDS
                if any(f == field for _, f, _ in missing)
            )
            self.stdout.write(self.style.WARNING(f"{len(missing)} missing media files ({summary})."))

            if not options["fix"]:
                self.stdout.write("Run again with --fix to clear these references.")
            else:
                cleared = 0
                for product, field, _ in missing:
                    setattr(product, field, "")
                    update_fields = [field]
                    if field == "mannequin_image":
                        product.mannequin_ready = False
                        update_fields.append("mannequin_ready")
                    product.save(update_fields=update_fields)
                    cleared += 1
                self.stdout.write(self.style.SUCCESS(f"Cleared {cleared} dead references."))
        else:
            self.stdout.write("Every product photo exists on disk.")

        # The mannequin photos are separate ImageFields on the bases and layers. They used to be skipped here,
        # which is how a dressing room with every garment photo intact could lose its base model silently.
        mannequin_missing = []
        for base in MannequinBase.objects.all().iterator():
            for field in BASE_IMAGE_FIELDS:
                name = getattr(base, field).name
                if name and not (media_root / name).exists():
                    mannequin_missing.append((f"mannequin base {base.gender} {field}", name))
        for layer in MannequinLayer.objects.select_related("base", "product").iterator():
            for field in LAYER_IMAGE_FIELDS:
                name = getattr(layer, field).name
                if name and not (media_root / name).exists():
                    mannequin_missing.append((f'layer {layer.pk} "{layer.product.name}" {field}', name))

        if mannequin_missing:
            for label, name in mannequin_missing:
                self.stdout.write(f"{label}: {name}")
            self.stdout.write(
                self.style.WARNING(
                    f"{len(mannequin_missing)} missing mannequin image(s). Restore the mannequin_alpha "
                    f"folder under {media_root} (the import kit or a media backup); --fix does not clear these."
                )
            )
        else:
            self.stdout.write("Every mannequin image exists on disk.")
