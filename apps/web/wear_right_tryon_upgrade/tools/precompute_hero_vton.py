"""Pre-compute Virtual Try-On cache for Wear Right Hero Demo Products (0 GB local VRAM needed).

Since this is a University FYP ("a few products will work for me"), pre-computing and caching the
AI Virtual Try-On outputs for your 10-15 hero products guarantees:
  - 0 ms loading time during the live defense viva
  - 0 MB VRAM required on your Dell Precision 5540 (Quadro T1000 4 GB)
  - 100% immunity to exam-room Wi-Fi drops or Hugging Face Space queues

Usage (from repo root):
  apps/server/venv/bin/python tools/precompute_hero_vton.py --provider fashn_space --limit 12
  apps/server/venv/bin/python tools/precompute_hero_vton.py --provider local_warp --limit 25
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SERVER_DIR = ROOT / "apps" / "server"
sys.path.insert(0, str(SERVER_DIR))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")

import django  # noqa: E402
django.setup()

from catalog.models import Product  # noqa: E402
from catalog.views_vton import execute_tryon_service  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description="Pre-compute VTON cache for Wear Right hero products.")
    parser.add_argument(
        "--provider",
        choices=["auto", "fashn_space", "catvton_space", "gemini_api", "local_warp"],
        default="auto",
        help="VTON provider to use when generating uncached images.",
    )
    parser.add_argument("--preset", default="men-regular", help="Studio model preset (e.g. men-regular).")
    parser.add_argument("--limit", type=int, default=15, help="Max hero products to pre-compute.")
    args = parser.parse_args()

    qs = (
        Product.objects.filter(status="Active", slot__in=["top", "outerwear", "kurta", "bottom"])
        .exclude(image="")
        .order_by("id")[: args.limit]
    )
    print(f"Pre-computing VTON cache for {qs.count()} hero products using provider={args.provider}...")
    ok, failed = 0, 0
    for product in qs:
        try:
            res = execute_tryon_service(
                product_id=product.id,
                model_preset=args.preset,
                provider=args.provider,
            )
            print(f"  [OK] #{product.id} {product.name} -> {res['result_url']} ({res['provider_used']})")
            ok += 1
        except Exception as exc:
            print(f"  [SKIP] #{product.id} {product.name}: {exc}")
            failed += 1
    print(f"Done: {ok} cached, {failed} skipped.")


if __name__ == "__main__":
    main()
