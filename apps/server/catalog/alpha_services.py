"""Mannequin (alpha) writes: import the team's render kit into bases and garment layers.

The kit folder (extras/mannequin-alpha-kit, see its GUIDE.md) holds:
  base/<gender>.png          the fixed model photo
  renders/<CODE>_<id>.png    one edit of the base per product, only that product swapped in
  manifest.csv               code,external_id,slot,... (external_id = Product.external_id, the Kaggle id)

Every render is aligned to the base and cut into a layer by catalog.engine.alpha_layers. Layers that pass
the engine's checks are approved straight away (the team already checked each render by eye); the rest are
stored as not approved with the reason, so they never show in the shop.
"""
from __future__ import annotations

import csv
import hashlib
import io
from dataclasses import dataclass, field
from pathlib import Path

from django.core.files.base import ContentFile
from django.db import transaction
from PIL import Image

from .engine import alpha_layers
from .models import MannequinBase, MannequinLayer, Product

MANIFEST_SLOTS = {"top", "kurta", "outerwear", "bottom", "shoes", "watch", "eyewear", "headwear"}


@dataclass
class ImportRow:
    code: str
    external_id: str
    slot: str
    outcome: str  # "approved", "rejected", "unchanged", "skipped"
    reason: str = ""
    product_id: int | None = None
    report: dict = field(default_factory=dict)


@dataclass
class ImportResult:
    base_created: bool
    base_changed: bool
    rows: list[ImportRow]

    def count(self, outcome):
        return sum(1 for row in self.rows if row.outcome == outcome)


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _png(array) -> bytes:
    buffer = io.BytesIO()
    Image.fromarray(array).save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()


def _jpeg(array) -> bytes:
    buffer = io.BytesIO()
    Image.fromarray(array).save(buffer, format="JPEG", quality=90)
    return buffer.getvalue()


def read_manifest(path: Path) -> list[dict]:
    with path.open(newline="", encoding="utf-8-sig") as handle:
        return [{(key or "").strip(): (value or "").strip() for key, value in row.items()} for row in csv.DictReader(handle)]


def _manifest_gender(row: dict) -> str:
    """The row's gender; an old manifest without the column is men, like the original pilot."""
    return (row.get("gender", "") or "").strip().lower() or "men"


def _find_product(row: dict) -> tuple[Product | None, str]:
    """Product for a manifest row, and a note saying how a fallback name match was resolved."""
    external_id = row.get("external_id", "")
    if external_id:
        return Product.objects.filter(external_id=external_id).first(), ""

    name = (row.get("product_name", "") or "").strip()
    if not name:
        return None, ""
    matches = list(Product.objects.filter(name__iexact=name).order_by("id")[:2])
    if len(matches) > 1:
        return None, f"ambiguous product_name {name!r}"
    if not matches:
        return None, f"no product with product_name {name!r}"
    return matches[0], f"matched product_name {matches[0].name!r}"


def _join_notes(*notes: str) -> str:
    return "; ".join(note for note in notes if note)


def import_alpha_kit(*, source_dir, gender, segment, rebuild=False) -> ImportResult:
    """Create/refresh the gender's base and one layer per matching manifest row with a render.

    `segment(image) -> (upper, lower[, full])` is the cloth segmenter (catalog.engine.cutout.cloth_segmenter
    in real runs, a stand-in in tests). Rows for the other gender are ignored; an old manifest with no
    `gender` column is treated as men. Unchanged renders are skipped unless `rebuild` or the base changed.
    """
    source = Path(source_dir)
    base_path = source / "base" / f"{gender}.png"
    manifest_path = source / "manifest.csv"
    if not base_path.exists():
        raise FileNotFoundError(f"no base photo at {base_path}")
    if not manifest_path.exists():
        raise FileNotFoundError(f"no manifest at {manifest_path}")

    base_sha = _sha256(base_path)
    with Image.open(base_path) as photo:
        base = alpha_layers.to_canvas(photo)
    base_cloth = segment(base)

    mannequin = MannequinBase.objects.filter(gender=gender).first()
    created = mannequin is None
    base_changed = created or mannequin.source_sha != base_sha
    if base_changed:
        mannequin = mannequin or MannequinBase(gender=gender)
        _save_base(mannequin, base, base_cloth, base_sha)
    rebuild = rebuild or base_changed

    rows = [
        _import_row(row, source=source, mannequin=mannequin, base=base, base_cloth=base_cloth, segment=segment, rebuild=rebuild)
        for row in read_manifest(manifest_path)
        if _manifest_gender(row) == gender
    ]
    return ImportResult(base_created=created, base_changed=base_changed, rows=rows)


def _save_base(mannequin, base, base_cloth, base_sha):
    width, height = alpha_layers.CANVAS
    base_top, _ = alpha_layers.build_layer(base, base, "base_top", base_cloth, base_cloth)
    base_bottom, _ = alpha_layers.build_layer(base, base, "base_bottom", base_cloth, base_cloth)
    with transaction.atomic():
        mannequin.width, mannequin.height = width, height
        mannequin.source_sha = base_sha
        mannequin.is_active = True
        for old in (mannequin.image, mannequin.base_top, mannequin.base_bottom):
            if old:
                old.delete(save=False)  # replace the file instead of piling up renamed copies
        mannequin.image.save(f"{mannequin.gender}.jpg", ContentFile(_jpeg(base)), save=False)
        mannequin.base_top.save(f"{mannequin.gender}-top.png", ContentFile(_png(base_top)), save=False)
        mannequin.base_bottom.save(f"{mannequin.gender}-bottom.png", ContentFile(_png(base_bottom)), save=False)
        mannequin.save()


def _import_row(row, *, source, mannequin, base, base_cloth, segment, rebuild) -> ImportRow:
    code, external_id, slot = row.get("code", ""), row.get("external_id", ""), row.get("slot", "").lower()
    result = ImportRow(code=code, external_id=external_id, slot=slot, outcome="skipped")
    if slot not in MANIFEST_SLOTS:
        result.reason = f"unknown slot {slot!r}"
        return result
    render_path = source / row.get("render_file", "")
    if not row.get("render_file") or not render_path.is_file():
        result.reason = f"render not found: {row.get('render_file') or '(empty)'}"
        return result
    product, match_note = _find_product(row)
    if product is None:
        result.reason = match_note or (
            f"no product with external_id {external_id!r}" if external_id else "no product with a matching product_name"
        )
        return result
    result.product_id = product.id
    if product.gender and product.gender not in (mannequin.gender, "unisex"):
        result.reason = _join_notes(match_note, f"product is {product.gender}, base is {mannequin.gender}")
        return result

    render_sha = _sha256(render_path)
    existing = MannequinLayer.objects.filter(base=mannequin, product=product).first()
    if existing and existing.source_sha == render_sha and existing.slot == slot and not rebuild:
        result.outcome = "unchanged" if existing.approved else "rejected"
        result.reason = _join_notes(match_note, existing.note)
        result.report = existing.report
        return result

    with Image.open(render_path) as photo:
        render = alpha_layers.to_canvas(photo)
    layer, report = alpha_layers.make_layer(base, render, slot, base_cloth, segment)
    reasons = alpha_layers.problems(report)
    layer_row = existing or MannequinLayer(base=mannequin, product=product)
    layer_row.slot = slot
    layer_row.source_sha = render_sha
    layer_row.report = report.as_dict()
    layer_row.approved = not reasons
    layer_row.note = "; ".join(reasons)[:255]
    if layer_row.image:
        layer_row.image.delete(save=False)
    layer_row.image.save(f"{mannequin.gender}-{product.external_id or product.id}.png", ContentFile(_png(layer)), save=False)
    layer_row.save()

    result.outcome = "approved" if not reasons else "rejected"
    result.reason = _join_notes(match_note, layer_row.note)
    result.report = layer_row.report
    if not reasons and (product.status == "Draft" or not product.is_active):
        result.reason = _join_notes(
            match_note, "approved, but the product is hidden from shoppers (Draft or inactive)",
        )
    return result


def set_layer_approved(*, layer: MannequinLayer, approved: bool) -> MannequinLayer:
    layer.approved = approved
    layer.save(update_fields=["approved", "updated_at"])
    return layer
