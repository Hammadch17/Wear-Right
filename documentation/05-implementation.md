# Chapter 5 — Implementation

## 5.1 Technology stack

| Layer | Technology | Version / role |
| --- | --- | --- |
| Web | Next.js App Router, React, TypeScript | Next 16, React 19, Tailwind v4 |
| API | Django, Django REST Framework | Django 5.2, DRF |
| Database | PostgreSQL + pgvector | Docker, host port 5433 |
| Auth | dj-rest-auth + SimpleJWT | httpOnly cookies, CSRF double-submit |
| Face | MediaPipe Face Landmarker | 478 landmarks |
| Models | ONNX Runtime | CPU, gender ViT |
| Background removal | rembg | isnet-general-use, u2net_cloth_seg |
| Testing | pytest, Vitest, Testing Library, Playwright | backend, web, e2e |
| Tooling | Node task runner | Windows/Linux/macOS setup |

## 5.2 Repository structure

```text
apps/server
  accounts/      profiles, auth, password reset
  catalog/       products, categories, colours, styles, mannequin
  scanner/       scan API, engine, quality, gender, records
  recommender/   palette, ranker, looks, tone picks, APIs
  orders/        cart, checkout, orders, legacy bookings
  staff/         admin auth, RBAC, admin APIs
  core/          settings, media serving, shared models

apps/web/src
  app/           Next.js routes
  components/    views and small UI components
  features/      scanner, recommender, cart, auth, mannequin
  lib/           API client, navigation, config

scripts/         Node task runner and Python launcher
extras/          mannequin kit and documentation
```

## 5.3 Scanner pipeline

### 5.3.1 Frame handling

- Camera mode captures **six frames** about **350 ms apart**.
- Each frame is resized to a maximum width of **800 px** before analysis.
- MediaPipe Face Landmarker returns **478** points.
- A face narrower than **15%** of the frame is rejected as too small.
- At least **400** skin pixels are required; **2500** pixels give full pixel-confidence.

### 5.3.2 Skin colour maths

The algorithm does not use raw RGB. It converts to CIELAB and samples only cheeks and forehead.

```text
BGR → CIELAB
ITA = arctan((L* − 50) / b*) × 180/π
depth:
  ITA > 41°  → Fair
  10–41°     → Medium
  < 10°      → Dark
hue = atan2(b*, a*) in degrees
undertone:
  hue ≥ 58°  → warm
  hue < 50°  → cool
  otherwise  → neutral
```

The median Lab is trimmed to the 10th–90th percentile before use. The nearest Monk swatch is chosen with CIEDE2000 over the ten Monk reference colours.

These thresholds are starting values. They were **not** tuned on a labelled skin-tone dataset, so the report must not claim measured skin-tone accuracy.

### 5.3.3 Photo-quality gate

| Check | Pass / warn / fail logic | Why |
| --- | --- | --- |
| Colour cast | Near-neutral pixels outside the face; warm b* > 12 warn, > 20 fail; cool b* < −8 warn, < −14 fail; a* tint > 10 warn, > 16 fail | Yellow bulbs and blue screens shift skin colour. |
| Blur | Laplacian variance of the face crop resized to 256 px; < 20 warns; fail disabled by default | Blur barely moves a median colour, so it lowers confidence rather than rejecting. |
| Side light | Difference in median L* between cheeks; > 12 warns, > 20 fails | One-sided light makes one cheek unrepresentative. |
| Pose | Nose offset from face centre ÷ face width; > 0.12 warns, > 0.20 fails | A turned face exposes different skin. |
| Exposure | Face L* p95; Too Low below 15, Low below 45, Good above 65; clipped pixels > 15% is Too Bright | Rejects unusable light before measuring. |

Every warning multiplies confidence by **0.85**. A fail returns the specific message and no result.

### 5.3.4 Consensus

Usable frames are grouped by depth. The largest group wins; ties are broken by summed confidence. Agreement is the share of usable frames in the winning bucket. Final confidence is:

```text
mean(frame confidence) × agreement
```

A single frame gets a **0.9** agreement factor because it cannot demonstrate consistency.

### 5.3.5 Gender suggestion

The final model is a quantised ViT classifier:

- File: `apps/server/ml_models/gender/gender_vit.onnx` (about 84 MB).
- Input: 224 × 224 RGB face crop, normalised to `[-1, 1]` with mean = std = 0.5.
- Output: two logits; label 0 = female, 1 = male.
- Crop: square around the landmark bounding box, margin **1.25×**, capped at 90% of the shorter image side, edge replication when the face is near a border.
- The model runs on CPU with two intra-op threads; measured **227–233 ms per frame** on the development laptop.
- The classifier is optional. A missing/broken model is caught and the scan continues without a suggestion.

Per-frame probabilities are combined by a confidence-weighted mean. Frame agreement reduces confidence:

```text
one frame:      confidence = top probability × 0.9 × 100
multiple frames: confidence = top probability × (0.5 + 0.5 × agreement) × 100
```

At **60%** or more the scanner uses the suggestion. Below 60% it asks Men/Women. The suggestion is never saved to the profile; a manual choice is.

### 5.3.6 Analysis timing

The UI records the time the request starts. `ANALYSING_MIN_MS = 2200`. After a successful response it waits only the remaining time:

```text
remaining = max(0, 2200 − elapsed)
```

A slow server therefore waits naturally; a fast server gets a deliberate 2.2 s analysing screen. A failed response never navigates.

## 5.4 Colour palette and ranking

### 5.4.1 Tone rules

`ToneColorRule` rows give a colour score for a depth × undertone:

- `+2` — best
- `+1` — good
- `−2` — avoid

Rules are stored in the database and editable in the admin **Skin Tone Matrix**, so the team can change advice without a deployment.

### 5.4.2 Top picks

`recommender/engine/ranker.py` scores each item:

```text
score = 0.5 × palette + 0.3 × style match + 0.2 × preference match
```

- palette is normalised from the rule score;
- style match is 1.0 when a preferred style overlaps, otherwise 0.3;
- preference is 1.0 for a favourite colour, 0.0 for an avoided colour, 0.5 otherwise;
- items with a palette score of −2 are dropped when the palette is known;
- gender must be the requested gender, unisex or blank;
- kids products are excluded from adult picks;
- results are sorted by score, then lower id, capped at three per category.

### 5.4.3 Tone picks selection order

`recommender/engine/tone_picks.py` applies the rules in order:

1. **Eligibility (hard):** active, in stock, adult, product slot/kind belongs to the group, gender is the requested gender or unisex.
2. **Tone (hard):** `compatible_skin_tone` is `All` or exactly the requested tone.
3. **Palette:** choose best scores first, then good, then neutral; avoid colours are used only when no non-avoid product exists.
4. **Variety:** prefer a second product from a different colour family when one exists.
5. **Stable tie-break:** mannequin-ready first, then lowest product id.
6. **Short groups:** return what exists and list the group key in `short_groups`.

Gender is never relaxed to fill a group. A men's request cannot return a women's product.

### 5.4.4 Group mapping

| Gender | Group | Product slots/kinds |
| --- | --- | --- |
| Men | Shirts | slot `top` |
| Men | Pants | slot `bottom` |
| Men | Caps | accessory with accessory kind `cap` and “cap” or “beanie” in the name |
| Men | Glasses | accessory with kind `sunglasses` |
| Women | Tops | slot `top` or `kurta` |
| Women | Bottoms | slot `bottom` |
| Women | Caps | same cap rule |
| Women | Glasses | same sunglasses rule |

The name check for caps protects against imported rows such as `Silver Chrono Watch` whose category makes the automatic kind guess wrong. The data should still be corrected in the admin panel.

## 5.5 Complete look and mannequin

- `engine/looks.py` fills missing slots around an anchor, respecting formality, palette, gender and one-piece coverage.
- A kurta/kameez/dress covers the top/bottom slots and is not duplicated.
- The dressing room reads `?gender=men|women` and `?skin=fair|wheatish|dark`.
- Layers are stacked by z-order: shoes, bottom, top/kurta, outerwear, watch, eyewear, headwear.
- Fair/dark variants fall back to the wheatish layer when missing.
- The mannequin media lives under `MEDIA_ROOT/mannequin_alpha`; `check_media` reports missing base/layer files but never clears mannequin references.

## 5.6 API contracts

All responses are JSON. Errors use `{ "status": "error", "message": "..." }` with an appropriate HTTP status.

### Scan

`POST /api/scanner/analyze/` — multipart `image` or `images[]`.

Success includes:

```json
{
  "status": "success",
  "depth": "Fair",
  "detected_skin_tone": "Fair",
  "undertone": "neutral",
  "confidence": 70.4,
  "confidence_score": 70.4,
  "monk": 5,
  "quality": { "ok": true, "checks": [], "confidence_factor": 1.0 },
  "palette": { "best": [], "avoid": [] },
  "gender_detection": {
    "suggested": "men",
    "probabilities": { "women": 0.0167, "men": 0.9833 },
    "confidence": 98.3,
    "confidence_label": "high",
    "agreement": 1.0,
    "frames_used": 6,
    "model": "ViT gender classifier",
    "reasons": ["All 6 usable frames agree", "Lighting was good"]
  }
}
```

A bad photo returns **422** with a reason and quality checks; the scanner keeps the retake UI.

`POST /api/scanner/manual/` — JSON `{depth, undertone}`. Returns a success shape with confidence 100 and a palette.

### Tone picks

`GET /api/recommendations/tone-picks/?tone=fair&gender=men&undertone=warm`

```json
{
  "status": "success",
  "tone": "Fair",
  "gender": "men",
  "undertone": "warm",
  "groups": [
    { "key": "shirts", "label": "Shirts", "slots": ["top"], "short": false, "items": [] },
    { "key": "pants", "label": "Pants", "slots": ["bottom"], "short": false, "items": [] },
    { "key": "caps", "label": "Caps", "slots": ["headwear"], "short": false, "items": [] },
    { "key": "glasses", "label": "Glasses", "slots": ["eyewear"], "short": false, "items": [] }
  ],
  "short_groups": []
}
```

Invalid tone/gender/undertone → 400.

### Main read endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/products/` | Paginated shop catalogue |
| GET | `/api/products/{id}/` | Product detail |
| GET | `/api/categories/`, `/api/colors/`, `/api/styles/` | Taxonomy |
| GET | `/api/recommendations/top/` | Ranked picks, accepts gender |
| GET | `/api/recommendations/tone-picks/` | Four groups for tone + gender |
| GET | `/api/looks/complete/?product_id=` | Complete an outfit |
| GET | `/api/mannequin/alpha/?gender=` | Base, skins and layers |
| GET | `/api/cart/` | Current cart |
| POST | `/api/checkout/` | Create order |
| GET | `/api/orders/` | Customer order history |

## 5.7 Frontend structure

| Area | Files |
| --- | --- |
| Scanner | `FaceScanView.tsx`, `components/scanner/GenderSuggestion.tsx` |
| Result | `ScannerResultView.tsx`, `ResultHeader.tsx`, `TonePickCard.tsx` |
| Scanner helpers | `features/scanner/api.ts`, `gender.ts`, `savedScan.ts`, `analysing.ts` |
| Recommendations | `RecommendedProductsView.tsx`, `features/recommender/api.ts`, `recommendationRules.ts` |
| Mannequin | `DressingRoomView.tsx`, `features/mannequin/dressingRoom.ts` |
| Cart | `features/cart/useCart.ts` |
| Auth | `features/auth/AuthProvider.tsx` |

The scanner is a state machine: `idle → camera → scanning → complete | retake | error`. The old inline result card was replaced by navigation to `/scanner/result`; small UI pieces were extracted so `FaceScanView.tsx` does not keep growing.

The result page restores a scan from `localStorage` through `createLocalStore`, avoiding hydration mismatches. A direct visit without a saved scan sends the visitor back to `/scanner`.

## 5.8 Security and privacy

- Shopper auth uses httpOnly `wr-access` / `wr-refresh` cookies and a non-sensitive `wr-session` hint cookie.
- Admin auth uses a separate cookie/session path and a separate login page.
- CSRF uses a double-submit cookie; invalid JWTs are treated as anonymous.
- Server-side permission checks are authoritative; UI hiding is only convenience.
- Passwords are hashed by Django; staff APIs never expose them.
- Face photos are processed in memory. `FaceScanRecord` stores measurements only.
- Inferred gender is not written to the profile; manual choice is.
- Uploaded files are validated by image decoding; product media is served from `MEDIA_ROOT`.

## 5.9 Media pipeline

- Product photos live outside git in `MEDIA_ROOT` (default `~/wear-right-data/media` when present).
- `seed_products` restores missing photos from `seed_media`, including Django's random suffix.
- `check_media` reports missing product and mannequin files; `--fix` clears product references but never mannequin references.
- Mannequin import uses transparent PNG layers cut from the kit renders.
- `next.config.ts` proxies `/media/*` to Django, so the browser sees one origin.

## 5.10 Setup and operation

`npm run setup` is the cross-platform entry point:

1. create the venv and `.env`;
2. install Python/Node packages;
3. start Postgres and Mailpit;
4. migrate;
5. seed products, taxonomy, tone rules and users;
6. download missing models;
7. import/publish mannequin data;
8. build the web app (with one automatic retry for Next's security advisory).

`npm run run-prod` frees ports 3000/8000, starts Docker, migrates, uses the existing build and runs Django + `next start`. `npm run models`, `seed`, `build`, `db:up|down|reset`, `test` and `doctor` cover the rest. The same commands work in Windows PowerShell.

## 5.11 Implementation limitations

- Skin-tone thresholds are not yet validated on a labelled set.
- Gender is an appearance-based binary suggestion, not identity; confidence is not calibrated accuracy.
- E2E specs were updated for the new result route but not executed after the final scanner change.
- Two imported cap rows are mis-tagged and protected by a name check rather than corrected data.
- The project is local-only; Django's development server is used behind the demo runner.
