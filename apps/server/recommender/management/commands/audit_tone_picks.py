"""Read-only look at tone picks for every gender, tone and group. No products or data are changed."""
from django.core.management.base import BaseCommand

from recommender.adapter import product_to_item
from recommender.engine.tone_picks import group_candidates
from recommender.selectors import get_tone_products
from recommender.services import tone_picks


class Command(BaseCommand):
    help = "Print eligible counts and the two picked products for every gender, tone and group."

    def handle(self, *args, **options):
        for gender in ("men", "women"):
            for tone in ("Fair", "Medium", "Dark"):
                self.stdout.write(f"{gender.upper()} / {tone.upper()}")
                products = {p.id: p for p in get_tone_products(tone, gender)}
                items = [product_to_item(product) for product in products.values()]
                counts = {key: len(candidates) for key, _, _, candidates in group_candidates(items, gender)}
                _, _, groups = tone_picks(tone, gender)
                for group in groups:
                    names = ", ".join(row["product"].name for row in group["items"]) or "(none)"
                    short = " SHORT" if group["short"] else ""
                    self.stdout.write(
                        f"  {group['label']}: {counts[group['key']]} eligible -> {names}{short}"
                    )
                self.stdout.write("")
