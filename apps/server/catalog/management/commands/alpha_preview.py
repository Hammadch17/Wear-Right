"""Cut alpha layers for a review gate without touching the database.

Example:
    manage.py alpha_preview --source extras/mannequin-alpha-kit --gender women \
        --codes WT1,WK1,WB2 --out docs/phases/phase-6-screens/alpha/v2-gate
"""
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from PIL import Image

from catalog.alpha_services import read_manifest
from catalog.engine import alpha_layers
from catalog.engine.cutout import cloth_segmenter


class Command(BaseCommand):
    help = (
        "Cuts alpha layers from a render kit and writes each layer on the base plus the gate composites. "
        "Nothing is saved to the database and the normal approval thresholds still apply."
    )

    def add_arguments(self, parser):
        parser.add_argument("--source", required=True, help="Kit folder with base/, renders/ and manifest.csv.")
        parser.add_argument("--gender", required=True, choices=["men", "women"])
        parser.add_argument("--codes", required=True, help="Comma-separated manifest codes, e.g. WT1,WK1,WB2.")
        parser.add_argument("--out", required=True, help="Folder for the PNG previews and composites.")

    def handle(self, *args, **options):
        source = Path(options["source"])
        out = Path(options["out"])
        gender = options["gender"]
        codes = [code.strip() for code in options["codes"].split(",") if code.strip()]
        if not codes:
            raise CommandError("--codes is empty")

        base_path = source / "base" / f"{gender}.png"
        manifest_path = source / "manifest.csv"
        if not base_path.is_file():
            raise CommandError(f"no base photo at {base_path}")
        if not manifest_path.is_file():
            raise CommandError(f"no manifest at {manifest_path}")
        out.mkdir(parents=True, exist_ok=True)

        rows = read_manifest(manifest_path)
        by_code = {row.get("code", ""): row for row in rows if row.get("code")}
        self.stdout.write("Loading the cloth segmentation model (u2net_cloth_seg)...")
        segment = cloth_segmenter(model_dir=settings.ML_MODELS_DIR / "rembg")
        with Image.open(base_path) as photo:
            base = alpha_layers.to_canvas(photo)
        base_cloth = segment(base)

        layers = {}
        results = {}
        for code in codes:
            row = by_code.get(code)
            result = self._cut(code, row, source, base, base_cloth, segment, layers)
            results[code] = result
            if result["layer"] is not None:
                self._save(out / f"{code}-layer.png", result["layer"])
                preview = alpha_layers.composite(base, [(result["slot"], result["layer"])])
                self._save(out / f"{code}-on-base.png", preview)

        self.stdout.write(f"{'code':<6}{'slot':<11}{'outcome':<11}{'ecc':>7}{'shift':>8}{'keep':>8}{'parts':>7}  note")
        for code in codes:
            result = results[code]
            report = result["report"]
            ecc = report.ecc if report else None
            shift = max(abs(report.shift_x), abs(report.shift_y)) if report else None
            keep = report.keep_change if report else None
            line = (
                f"{code:<6}{result['slot']:<11}{result['outcome']:<11}"
                f"{'' if ecc is None else f'{ecc:.3f}':>7}"
                f"{'' if shift is None else f'{shift:.1f}px':>8}"
                f"{'' if keep is None else f'{keep:.2%}':>8}"
                f"{'' if report is None else report.components:>7}  {result['note']}"
            )
            style = {"approved": self.style.SUCCESS, "rejected": self.style.ERROR, "missing": self.style.WARNING}
            self.stdout.write(style.get(result["outcome"], str)(line))

        self._composites(gender, by_code, source, base, base_cloth, segment, layers, out, results)

    def _cut(self, code, row, source, base, base_cloth, segment, layers):
        result = {"slot": "", "outcome": "missing", "note": "", "layer": None, "report": None}
        if row is None:
            result["note"] = "code not found in manifest.csv"
            return result
        slot = row.get("slot", "").lower()
        result["slot"] = slot
        render_file = row.get("render_file", "")
        render_path = source / render_file if render_file else None
        if not render_file or not render_path.is_file():
            result["note"] = f"render not found: {render_file or '(empty)'}"
            return result
        if slot not in alpha_layers.SLOTS:
            result["outcome"] = "rejected"
            result["note"] = f"unknown slot {slot!r}"
            return result
        with Image.open(render_path) as photo:
            render = alpha_layers.to_canvas(photo)
        layer, report = alpha_layers.make_layer(base, render, slot, base_cloth, segment)
        reasons = alpha_layers.problems(report)
        result.update(
            outcome="rejected" if reasons else "approved",
            note="; ".join(reasons),
            layer=layer,
            report=report,
        )
        layers[code] = (slot, layer)
        return result

    def _composites(self, gender, by_code, source, base, base_cloth, segment, layers, out, results):
        if gender == "women":
            specs = [("WT1", "WB2"), ("WK1", "WB2")]
        else:
            specs = [("T2", "MO3")]
            kurta = next(
                (
                    code for code, row in by_code.items()
                    if row.get("gender") == "men" and row.get("slot", "").lower() == "kurta"
                    and (source / row.get("render_file", "")).is_file()
                ),
                None,
            )
            if kurta:
                specs.append((kurta, "MO3"))
            else:
                self.stdout.write("Skipped MO3 over a kurta: no men's kurta render in the kit yet.")

        for spec in specs:
            missing = [code for code in spec if code not in layers and not self._cut_extra(
                code, by_code, source, base, base_cloth, segment, layers, results,
            )]
            if missing:
                self.stdout.write(self.style.WARNING(
                    f"Skipped composite {'+'.join(spec)}: missing {', '.join(missing)}."
                ))
                continue
            layers_for_spec = [(layers[code][0], layers[code][1]) for code in spec]
            composite = alpha_layers.composite(base, layers_for_spec)
            name = f"composite-{'-'.join(spec)}.png"
            self._save(out / name, composite)
            rejected = [code for code in spec if results.get(code, {}).get("outcome") == "rejected"]
            note = " (contains rejected layer)" if rejected else ""
            self.stdout.write(self.style.SUCCESS(f"Wrote {name}{note}."))

    def _cut_extra(self, code, by_code, source, base, base_cloth, segment, layers, results):
        if code in layers:
            return True
        result = self._cut(code, by_code.get(code), source, base, base_cloth, segment, layers)
        results[code] = result
        return result["layer"] is not None

    @staticmethod
    def _save(path: Path, array):
        Image.fromarray(array).save(path)
