# Plan 08: outfit board instead of a mannequin, and local media storage done properly

## Decision (2026-10-28)

The mannequin is dropped. Both attempts failed on our data: the SVG figure looks like clip art, and the AR overlay
(plan 07) pasted cut-outs on stock models who were already dressed, which looks broken (screenshots in the chat log).
Instead, the look is shown as an **outfit board**: the selected products' own photos arranged the way a person wears
them, top over bottom over shoes, accessories alongside. This is how big shops show "complete the look"; it uses real
product photos, so it always looks like the actual products and cannot misplace a watch.

The USP for the thesis becomes: **skin-tone-aware outfit completion**, i.e. the recommender picks a colour-harmonious top, bottom,
shoes and accessory for the shopper's tone, shown as one outfit board that can be swapped piece by piece and added to
the cart in one click. Plans 02 (SVG mannequin), 05 (diffusion try-on) and 07 (AR try-on) are superseded.

## Part A: remove the mannequin work

On the working branch:

1. If the database already has the plan 07 migration (`tryon_anchors`/`tryon_ready`), migrate `catalog` back to the
   migration before it first: `python manage.py migrate catalog <previous_migration>`.
2. `git revert` the plan 07 commits (AR try-on: `/try-on` page, `features/tryon/*`, `components/tryon/*`,
   `public/tryon/*`, `public/mediapipe/*`, anchors engine/command/fields, the admin anchors editor). Keep plan 01 (Product.kind) and the
   backend `display_hex` from plan 02.
3. Remove the SVG mannequin UI: `components/Mannequin.tsx`, `features/mannequin/geometry.ts`, `garments.ts`,
   `layout.ts` and their tests, `e2e/10-mannequin.spec.ts` (say in the report that the feature was removed, not that a
   test was weakened). Leave the backend `prepare_mannequin_asset` pipeline in place; its cut-outs are reused below.
4. `rg -i "mannequin|tryon|try-on"` in `apps/web/src` must only show the new outfit board (and comments explaining the history if any).

## Part B: the outfit board

Component `src/components/OutfitBoard.tsx`, used in `OutfitPreviewModal.tsx` (right panel) and `CompleteOutfitView.tsx`
(the sticky side panel). Props: `items` (the look: anchor + picks), `onSelect(itemId)`.

Layout (desktop; on mobile the same column scales down):

```
┌──────────────────────────────┬─────────┐
│            TOP               │  ACC 1  │
│      (or kurta / dress)      ├─────────┤
├──────────────────────────────┤  ACC 2  │
│           BOTTOM             ├─────────┤
│                              │  ACC 3  │
├──────────────────────────────┴─────────┤
│              SHOES                      │
└─────────────────────────────────────────┘
```

- One rounded card on the brand cream background (`bg-cream-card`). Each piece sits in its own tile with
  `object-contain` (never cropped), a soft drop shadow, and the slot label + price on hover/under it on mobile.
- Image per piece: the cut-out (`mannequin_image`) when it exists and `mannequin_ready` is true (transparent, looks like a
  flat-lay); otherwise the original product `image`. Both through the shared `ProductImage` component (Part C) so a
  missing file shows the placeholder, never alt text.
- Outerwear: drawn as a second, slightly overlapping tile to the left of the top. Kurta/dress: one tall tile spanning
  top and bottom; no bottom tile unless the look has one.
- The anchor (the product the shopper opened) gets a "Your pick" badge.
- Clicking a tile scrolls to / highlights that slot's row in the list (Complete Outfit) or opens the product (preview).
- Swapping a piece in the list updates the board immediately (no reload).
- Empty slots show a dashed tile "No match in stock", not nothing.
- Total price of the board under it, and the existing "Add whole look to cart" button.

Tests (vitest): slot placement for casual (top+bottom+shoes+accessory), formal (outerwear+top+bottom+shoes+tie+watch),
eastern (kurta+footwear+waistcoat), women eastern (kurta+bottom+dupatta+footwear); anchor badge; cut-out preferred
over photo only when `mannequin_ready`; empty slot tile.

## Part C: local media storage (no S3)

### How it works today

- Django stores uploads on the **local disk** with the default `FileSystemStorage`: `MEDIA_ROOT = apps/server/media`,
  `MEDIA_URL = /media/`. Product photos are in `media/products/`, cut-outs in `media/products/` (`*-cutout.png`) and
  `media/products/mannequin/`, seed photos are copied from `apps/server/seed_media/products/`.
- Django serves `/media/` **only when `DEBUG=True`** (`core/urls.py` adds `static()` in debug). Next.js rewrites
  `/media/*` to Django, so the browser loads images from port 3000.
- `media/` is gitignored. **Every git worktree has its own empty `media/` folder**, so a branch checked out in a
  new worktree (all the opencode agents work in worktrees) has database rows pointing at files that are not there.
  That is the most likely reason some images break: the row exists, the file does not.

### Changes

1. **One shared media folder.** `MEDIA_ROOT` from env: `MEDIA_ROOT = Path(os.environ.get("MEDIA_ROOT", BASE_DIR / "media"))`.
   Document setting it in `apps/server/.env` to an absolute path outside the repo, e.g.
   `MEDIA_ROOT=/home/user/wear-right-data/media`, and do the same in every worktree's `.env`. Move the existing files there once
   (`rsync -a apps/server/media/ /home/user/wear-right-data/media/`). Same idea for `ML_MODELS_DIR` (already env-driven).
2. **Serve media in the demo too.** `npm run demo` runs Django with `--noreload`, and if `.env` has `DEBUG=False` every
   image 404s. Add a small `serve_media` setting (`SERVE_MEDIA=True` by default for local) and serve `/media/` with
   `django.views.static.serve` when it is on, independent of `DEBUG`. This is a local FYP app; no CDN, no S3.
3. **`manage.py check_media`**: lists every Product image/cut-out field whose file is missing on disk, with counts;
   `--fix` clears missing cut-outs (`mannequin_image`, `mannequin_ready=False`) and points missing main images at
   nothing so the UI shows the placeholder. Run it and paste the before/after counts.
4. **Never show alt text for a broken image.** `src/components/ProductImage.tsx`: `<img>` with `onError` that swaps to
   `PLACEHOLDER_IMAGE` once, `loading="lazy"`, `object-contain` by default. Use it everywhere a product image is drawn:
   `ShopView.tsx` (cards and quick view), `ProductDetailView.tsx`, `CompleteOutfitView.tsx` (rows and swap tiles),
   `OutfitPreviewModal.tsx`, `CartView.tsx`, `CheckoutView.tsx`, `MyOrdersView.tsx`, `OrderDetailView.tsx`,
   `WishlistView.tsx`, `RecommendedProductsView.tsx`, `AdminView.tsx`.
5. **Shop page images.** The shop cards use `prod.image` built from `item.image_url || item.image`, while the product page
   works. Find the actual difference: open `/shop` with the network tab and list every failing image URL with its status.
   Fix the cause (wrong field, a cropped thumbnail path, a missing file) rather than hiding it; report what it was.
6. **Uploads keep working**: admin image upload saves into the shared `MEDIA_ROOT`; the 5 MB and type checks stay.
7. `make media-backup`: `tar czf ~/wear-right-media-$(date +%F).tgz -C $MEDIA_ROOT .` for before the demo.

Tests: `check_media` finds a missing file and `--fix` clears it (tmp `MEDIA_ROOT`); `/media/<file>` is served with
`SERVE_MEDIA=True` and `DEBUG=False`; `ProductImage` swaps to the placeholder on error (vitest).

## Manual checks

- `/shop`: every product card shows a photo or the placeholder; no alt text anywhere.
- Complete Outfit for a shirt, a kurta and a formal look: the board shows the right tiles; swapping a bottom updates it.
- Shop preview modal shows the same board.
- `npm run demo` (production build, DEBUG off): images still load.
- A second worktree with `MEDIA_ROOT` set to the shared folder shows the same images.
