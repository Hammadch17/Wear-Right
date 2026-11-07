# Phase 6: Basic flat 2D SVG mannequin

Status: done with open items. Date: 2026-10-28. Branch: `feat/password-reset` (plan 02 commit `5766a69`, childrenswear/gender follow-up `cf8fe97`).

## Goal

Replace the grey statue and pasted product photos with a basic 2D mannequin that can draw every product in the catalogue, in the colours the recommender chose, on a body in the shopper's size.

## What changed

- `apps/web/src/features/mannequin/geometry.ts`: one set of body key points per gender, plus `slim | regular | plus` horizontal scaling. Pure data and functions.
- `apps/web/src/features/mannequin/garments.ts`: one vector shape per garment kind (tops, bottoms, outerwear, footwear, accessories), generated from the body points. Shoes return a left and a right path; the watch is drawn at the wrist point.
- `apps/web/src/features/mannequin/layout.ts`: rewritten to layer the anchor and look picks by slot and z-order, drop a second item for an occupied slot, and list undrawable items (bags) separately.
- `apps/web/src/components/Mannequin.tsx`: renders one `<svg viewBox="0 0 400 800">` with exposed `data-part`, `data-testid="mannequin-layer"`, `data-kind`, `data-product-id`, `data-anchor` and `data-foot` hooks. Slim/Regular/Plus remain; the photo Front/Back toggle is gone.
- `CompleteOutfitView.tsx` and `OutfitPreviewModal.tsx` use the new layout and pass the shopper's gender to the look API. The opened product is always a layer, badged "Your pick".
- `catalog/engine/color.py` and `catalog/serializers.py`: `Product.display_hex` gives one colour fallback chain (`color_hex` → `primary_color.hex` → named colour table → grey) for the mannequin and the recommender.
- `public/mannequin/*.png` and `public/mannequin/anchors.json` were deleted. The unused Django mannequin-image pipeline and its tests remain.
- Tests: rewritten `mannequin/layout.test.ts`, new `garments.test.ts` (every kind, both genders, all presets, two shoes, watch overlaps the left wrist, nothing outside the canvas), rewritten `e2e/10-mannequin.spec.ts`, and backend `display_hex` coverage. `catalog/engine/kinds.py` and its tests were tightened so Boys/Girls/Baby/Infant names are childrenswear.

## Decisions and why

- **Draw garments, do not paste photos.** Most admin products have no processed `mannequin_image`, and the pipeline refuses photos of people, so the old mannequin silently skipped the product the shopper opened. A vector shape exists for every product and cannot fail that way.
- **Two shoes and a wrist watch are geometry, not anchor boxes.** The feet and wrists are known points on our own body, so the pair and the watch placement are guaranteed by construction instead of by a hand-tuned box per photo.
- **One front view.** There are no back photos to compose with; a flat back would add work without adding information. The Front/Back control was removed.
- **The anchor owns its slot.** If the look engine or the layout sees a second top, the shopper's opened product wins.
- **The backend photo pipeline stays.** It is unused by the web app but harmless, tested, and may support future work; removing it would be unrelated churn.

## Gates (real output)

Run in this branch on 2026-10-28 after plans 00–03:

```
backend pytest     531 passed, 9 skipped (27.73s)
web vitest         117 passed (13 files, 3.79s)
tsc --noEmit       clean
eslint             0 errors, 2 warnings (unused-disable in AdminView, unused refreshProducts in ShopView)
next build         passed (after the Next.js 16.4.0 security advisory retry)
Playwright         not run here; the lead runs `make e2e` after the branch is reviewed
```

## Real-model checks

None. The mannequin is deterministic geometry; no ML model or weights are involved in this phase.

## Known limitations

- Flat front view only: no back view, draping, fabric, poses or body diversity beyond the three width presets.
- The body is a neutral tone, not the shopper's detected skin tone.
- Bags and unknown accessories are listed under the mannequin, not drawn.
- Garment shapes are a recognisable fashion-flat approximation, not a tailored fit.
- The backend image-compositing pipeline still exists but is no longer reachable from the shop UI.

## How to run it

Open any product in the shop and choose **Preview Outfit**, or open `/complete-outfit`. Switch Slim / Regular / Plus to resize the body.

## Open items for later phases

- Photo-realistic or layered try-on, back view, poses and drape.
- Tint the body with the shopper's detected skin tone.
- Measure whether the mannequin helps shoppers understand an outfit (Phase 8 user study).

## Mannequin (alpha)

Added 2026-11-07 on `feat/mannequin-alpha` as a separate pilot behind `/mannequin`; the SVG mannequin above is unchanged.

**How it works.** The pilot uses one AI-generated model photo (`extras/mannequin-alpha-kit/base/men.png`) and, for each curated product, one Gemini (Nano Banana Pro) edit of that photo with only that item swapped. `manage.py import_alpha_mannequin` (`make alpha-import SOURCE=extras/mannequin-alpha-kit`) aligns every render to the base with OpenCV ECC, cuts the item out as a transparent layer (tops and bottoms with rembg `u2net_cloth_seg`, shoes and watches by colour difference in their band), extends trouser layers under the tee hem, and rejects renders where the person moved. The thresholds live in `catalog/engine/alpha_layers.py`. Layers are stored in `MannequinBase` / `MannequinLayer` under `MEDIA_ROOT/mannequin_alpha/`. `GET /api/mannequin/alpha/?gender=men` returns the base and approved layers by slot; `/mannequin` stacks them as `<img>` layers so any shirt + trousers + shoes + watch combination shows instantly, and alpha products get a "Try it on the mannequin (alpha)" button. Everything is labelled AI-generated; nothing is generated live.

**Real import.** Run on 2026-11-07 against the pilot kit and the shared catalogue:

```text
code  slot    outcome        ecc   shift    keep  note
T1    top     approved     0.999   0.2px   0.29%
T2    top     approved     0.997   0.6px   0.75%
T3    top     approved     0.999   0.5px   0.25%
B1    bottom  approved     0.996   0.4px   0.10%
B2    bottom  approved     0.998   0.3px   0.11%
B3    bottom  approved     0.996   0.3px   0.15%
S1    shoes   approved     0.998   0.3px   0.20%
S2    shoes   approved     0.999   0.4px   0.26%
W1    watch   approved     0.998   0.4px   0.15%
W2    watch   approved     0.997   0.2px   0.16%
Approved 10, unchanged 0, rejected 0, skipped 0.
```

A second run reported all 10 rows as `unchanged`, so re-importing the same kit is idempotent. All ten rows were approved; no rows were skipped, missing, Draft or inactive. Two catalogue labels do not match the kit artwork (for example the "Mark Taylor Men Striped Black Trousers" image and layer are dark green, and the "Puma Men Soft Red T-shirt" artwork is a coral polo). That is existing product data, not an import defect; the product data was not edited.

**Screenshots.** Desktop 1440 px and phone 390 px, three outfits each:

| Outfit | Desktop | Phone |
| --- | --- | --- |
| A: red tee, light grey trousers, brown shoes, CASIO watch | <img src="phase-6-screens/alpha/desktop-outfit-a.png" width="460"> | <img src="phase-6-screens/alpha/phone-outfit-a.png" width="190"> |
| B: pink check shirt, blue jeans, blue shoes, Titan watch | <img src="phase-6-screens/alpha/desktop-outfit-b.png" width="460"> | <img src="phase-6-screens/alpha/phone-outfit-b.png" width="190"> |
| C: brown check shirt, dark green trousers, blue shoes, Titan watch | <img src="phase-6-screens/alpha/desktop-outfit-c.png" width="460"> | <img src="phase-6-screens/alpha/phone-outfit-c.png" width="190"> |

**Limits (v1 pilot).**

- Curated pilot set only: ten men's products (three shirts, three trousers, two shoes, two watches). Products without a layer do not get the try-on button.
- Men only: the v1 pilot has no women's base or layers.
- The model is AI-generated and fixed: one body, one pose, one backdrop. It is not the shopper and does not reflect their size or skin tone.
- Not live try-on: layers are pre-generated edits of the model photo, not a real-time render of the shopper or the product. Fit, drape and fabric behaviour are illustrative.

### v2: eight slots and women (2026-11-07)

Plan 12 extended the pilot without changing the stacking approach. The engine now knows eight slots — `top`, `kurta`, `outerwear`, `bottom`, `shoes`, `watch`, `eyewear` and `headwear` — and the cloth segmenter returns upper, lower and full-body masks. Kurtas are cut down to the knee and deliberately cover the trouser top; outerwear is cut only around the torso so the shirt inside an open waistcoat or blazer shows through; the trouser dilation is wider so patiala, shalwar and skirts are not clipped by the base trousers; sunglasses and caps are cut in their head bands. The web dressing room has a Men | Women switch, a kurta replaces the shirt (and the other way round), the default outfit stays shirt + trousers + shoes + watch, and shuffle picks either a shirt or a kurta and adds outerwear, sunglasses and a cap with a 50% chance each. Product pages open the mannequin for the product's own gender. The importer filters rows by the manifest's `gender` column (missing means men) and falls back from `external_id` to an exact case-insensitive `product_name`; ambiguous names are skipped.

**Real v2 import.** The shared kit's manifest filenames did not match the render filenames, so the renders were staged under the manifest names in a temporary source folder; missing women's renders were not fabricated. Men, 2026-11-07:

```text
code  slot    outcome        ecc   shift    keep  note
T1    top     unchanged    0.999   0.2px   0.29%
T2    top     unchanged    0.997   0.6px   0.75%
T3    top     unchanged    0.999   0.5px   0.25%
B1    bottom  unchanged    0.996   0.4px   0.10%
B2    bottom  unchanged    0.998   0.3px   0.11%
B3    bottom  unchanged    0.996   0.3px   0.15%
S1    shoes   unchanged    0.998   0.3px   0.20%
S2    shoes   unchanged    0.999   0.4px   0.26%
W1    watch   unchanged    0.998   0.4px   0.15%
W2    watch   unchanged    0.997   0.2px   0.16%
MO1   outerwear approved    0.996   0.5px   1.46%
MB4   bottom  approved     0.995   0.3px   0.18%  matched product_name 'Black Formal Trouser'
MO2   outerwear approved    0.999   0.2px   1.27%  matched product_name 'Olive Green Tailored Blazer'
MB5   bottom  approved     0.995   0.6px   0.20%  matched product_name 'Olive Suit Trousers'
MO3   outerwear approved    0.994   0.8px   0.86%
MO4   outerwear approved    0.998   0.4px   0.27%
MK1   kurta   approved     0.994   1.0px   1.05%
MK2   kurta   approved     0.995   0.8px   0.26%
MK3   kurta   approved     0.994   0.3px   0.49%
MB6   bottom  approved     0.995   0.6px   0.26%
MS3   shoes   approved     0.992   0.2px   3.32%
MS4   shoes   skipped                             product is women, base is men
ME1   eyewear rejected     0.993   0.7px   9.06%  9.1% of the picture outside the item changed (pose or framing moved)
MH1   headwear approved    0.996   0.7px   0.16%
Approved 12, unchanged 10, rejected 1, skipped 1.
```

Women, 2026-11-07:

```text
WT1   top     approved     0.998   0.4px   0.05%
WT2   top     skipped                             render not found
WK1   kurta   skipped                             render not found
WK2   kurta   skipped                             render not found
WK3   kurta   skipped                             render not found
WK4   kurta   skipped                             render not found
WK5   kurta   skipped                             render not found
WB1   bottom  skipped                             render not found
WB2   bottom  skipped                             render not found
WB3   bottom  skipped                             render not found
WB4   bottom  skipped                             render not found
WS1   shoes   skipped                             render not found
WS2   shoes   skipped                             render not found
WW1   watch   skipped                             render not found
WW2   watch   skipped                             render not found
WE1   eyewear skipped                             render not found
Approved 1, unchanged 0, rejected 0, skipped 15.
```

**Screenshots (v2).** Desktop 1440 px and phone 390 px, full page, in `phase-6-screens/alpha/v2/`:

| Outfit | Desktop | Phone |
| --- | --- | --- |
| A: red tee, black trousers, formal shoes, CASIO watch | <img src="phase-6-screens/alpha/v2/mannequin-desktop-outfit-a.png" width="460"> | <img src="phase-6-screens/alpha/v2/mannequin-phone-outfit-a.png" width="190"> |
| B: red check shirt, olive blazer, olive suit trousers, formal shoes, Titan watch | <img src="phase-6-screens/alpha/v2/mannequin-desktop-outfit-b.png" width="460"> | <img src="phase-6-screens/alpha/v2/mannequin-phone-outfit-b.png" width="190"> |
| C: blue printed kurta, white churidar, blue waistcoat, formal shoes, Titan watch | <img src="phase-6-screens/alpha/v2/mannequin-desktop-outfit-c.png" width="460"> | <img src="phase-6-screens/alpha/v2/mannequin-phone-outfit-c.png" width="190"> |
| Women: the only approved women's layer (light blue top) | <img src="phase-6-screens/alpha/v2/mannequin-desktop-women.png" width="460"> | <img src="phase-6-screens/alpha/v2/mannequin-phone-women.png" width="190"> |

**Limits (v2).**

- Still a curated set: the v2 import has 13 approved men's layers across seven slots and one approved women's layer. The women's base exists, but 15 women's renders are missing, so women's kurta/dupatta, patiala, skirt and heels cannot be shown yet. One men's eyewear render was rejected because 9.1% of the picture outside the item changed; no sunglasses row is shown. The men's chappal row was skipped because that product is tagged women in the catalogue.
- Known cut-out artefacts: sleeved blazers/waistcoats lose their sleeves because the outerwear mask only keeps changed pixels near the base torso, so sleeves over bare arms become transparent. The white churidar shows dark gaps where the wide layer is transparent over the base trousers, and a kurta can show a thin vertical light streak below its hem. These are real limitations of the current masks, not display bugs; thresholds were not loosened to hide them.
- The model is AI-generated and fixed: one body, one pose, one backdrop per gender. It is not the shopper and does not reflect their size or skin tone.
- Not live try-on: layers are pre-generated edits of the model photo, not a real-time render of the shopper or the product. Fit, drape and fabric behaviour are illustrative.

