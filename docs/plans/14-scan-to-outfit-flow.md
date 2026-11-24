# Plan 14: site images, admin cleanup, and the scan → skin tone result → outfit picks flow

Written 2026-11-18 by the lead after reading `CLAUDE.md`, plans 06 and 13, `docs/plans/TASKS.md`, `HomeView.tsx`, `AboutView.tsx`, `features/admin/sections.ts`, `staff/urls.py`, `staff/catalog.py` and the scanner and recommender URL files.

Three parts, three prompts (see `14-prompts.md`). Do them in order: Part 1 and Part 2 are small, Part 3 is the real work.

This plan contains no code on purpose. It names the files and the rules; the agent reads the real code and decides how.

## Rules that apply to every part

- Read `CLAUDE.md`, `docs/STATUS.md` and the section of this plan you were given. Do only that section.
- Follow `docs/plans/README.md`: tests ship in the same commit; never delete or weaken a test to get green; **do not run Playwright or `make e2e`**; before reporting run `make test` and `npm --prefix apps/web run build`, then start the app (`npm run dev`) and check the feature by hand in the browser.
- If a test or an e2e spec describes behaviour this plan removes or changes, rewrite it to the new behaviour (do not run the e2e spec) and say so in the report.
- Do not change the skin tone algorithm (`scanner/engine/*` maths). This plan only changes what is shown and what is picked from the result.
- Do not invent products, prices or numbers. Anything missing from the catalog is reported, not made up.
- Finish with a short report: files changed, real command output, what is left open. Update `docs/STATUS.md` and add a row for plan 14 to `docs/plans/README.md`.

---

## Part 1: home hero, About hero, team photos (small)

### Files the lead already added (do not recreate, do not resize)

| File in `apps/web/public/` | What it is |
| --- | --- |
| `brand/hero-new.png` | The new homepage hero (1672 x 941, three men in white kurta with shawls). |
| `team/hammad-ahmad.jpg` | Hammad Ahmad, square 640 px face crop. |
| `team/ali-tariq.jpg` | Ali Tariq, square 640 px face crop. |
| `team/sameer-ahmad.jpg` | Sameer Ahmad, square 640 px face crop. |

The current (older) homepage hero is `public/brand/hero.png`. **Keep that file exactly as it is.** The About page is going to use it.

### 1A. Homepage hero

- `src/components/HomeView.tsx`, hero right column: point the image at `/brand/hero-new.png` and update the alt text to describe the new photo.
- The frame around the image is a fixed box with `object-cover` (roughly 815 by 660). The new image is wide (16:9), so the sides will be cropped and the two outer men can lose their faces. Change the frame's aspect ratio and/or the image position so **all three faces are fully visible** at 1920, 1440, 1024 and 390 px wide. Keep the soft fade on the left edge only if it does not wash out the left man; shrink or remove it otherwise.
- Do not touch the text column, stats banner or anything below the hero.

### 1B. Older hero on the About page

- Request: "add the older homepage hero on the About page". Reading: use the old hero (`/brand/hero.png`) as the image in the About page's top hero section, in place of `/brand/about-hero.jpg`.
- `src/components/AboutView.tsx`, hero right column. That frame is a narrow portrait box (3:4, max 380 px wide). The old hero is a wide group photo, so it must **not** be squeezed into that portrait box (three faces would be cut). Change the frame to a wide shape that fits the photo, keep the rounded border, the gold outline and the small "Wear Right" badge, and make sure the left column text still looks balanced next to it (the column split may need to change from 5/7 to something wider for the image).
- Leave `about-hero.jpg`, `about-mission.png` and `hero.png` on disk. Do not delete or rename anything.
- If the result looks wrong, stop and describe the problem instead of forcing it; the alternative placement is a wide banner section between the hero and the mission block.

### 1C. Team photos

- `AboutView.tsx`, "Meet Our Team" section, three cards. Today each card shows a blue circle with initials (HA, AT, SA).
- Replace each initials circle with the matching photo from `/team/`. Names, roles and descriptions stay exactly as they are. Match by name: Hammad Ahmad → `hammad-ahmad.jpg`, Ali Tariq → `ali-tariq.jpg`, Sameer Ahmad → `sameer-ahmad.jpg`.
- Make the avatar larger than the old 80 px circle (about 112 to 128 px), still a circle, `object-cover`, keep the light blue border and soft shadow, alt text = the person's name. Keep the card hover effect.
- Check the face is centred in the circle at desktop and mobile.

### Part 1 checks

1. `/` shows the new hero with all three faces, on desktop and phone width.
2. `/about` top hero shows the older hero (three men in black and cream waistcoats) with all faces visible.
3. `/about` team section shows three photos with the right names under them.
4. `npm --prefix apps/web run build` and `make test` pass. If an existing test asserts the old hero path, initials, or `about-hero.jpg`, update it.

---

## Part 2: remove Bookings from the admin panel (small)

Scope: **the web admin panel only** (`/admin/...` and `/api/admin/...`). Do not drop the `Booking` model or its table, do not write a destructive migration, and do not touch any shopper-facing booking feature if one exists (report it if you find one). Leave the Django built-in admin registration in `orders/admin.py` alone and mention it in the report.

What to remove or change (find every reference; the list is a starting point, not complete):

| Area | What to do |
| --- | --- |
| `apps/web/src/features/admin/sections.ts` | Remove the Bookings entry. `ADMIN_SECTION_SLUGS` and `sectionFromPath` follow from it. `sections.test.ts` must still pass. |
| `apps/web/src/components/AdminView.tsx` (82 KB) | Remove the Bookings screen, its state, handlers and any dashboard tile that counts or links to bookings. Take care not to break neighbouring sections. |
| `apps/web/src/features/admin/api.ts` | Remove the booking calls and types. |
| `apps/web/src/components/admin/TeamSection.tsx` | The role editor must no longer offer booking permissions (it likely reads them from the API; verify). |
| `apps/server/staff/urls.py`, `views.py`, `serializers.py`, `selectors.py`, `services.py` | Remove `/api/admin/bookings/` list and detail endpoints and the code only they use. The dashboard endpoint must stop returning booking numbers (and the web side must not read them). |
| `apps/server/staff/catalog.py` | Remove `bookings.view` and `bookings.manage` from `PERMISSIONS` and from the Manager and Order Handler default roles. Update the descriptions that say "orders and bookings". |
| New data migration in `apps/server/staff/migrations/` | Strip any stored `bookings.*` keys from existing `AdminRole.permissions` rows so old databases are clean (Super Admin's `*` stays). Reversible no-op backwards. |
| Tests | Update `staff/tests/test_rbac.py`, `test_team_crud.py`, `core/tests/test_permission_matrix.py`, `core/tests/test_smoke_endpoints.py` and any other test that mentions bookings; update `web/e2e/05-admin.spec.ts` and `06-all-routes.spec.ts` (do not run them). Add a test that `/api/admin/bookings/` is gone (404) and that no role can hold a booking permission. |
| Docs | `CLAUDE.md` (the `orders` row mentions Booking and the permissions list), `docs/STATUS.md`. |

### Part 2 checks

1. Sidebar has no Bookings item; `/admin/bookings` shows the normal not-found page, not an error.
2. Dashboard loads with no booking card and no console errors.
3. Team & Roles: no booking permission checkboxes; an existing role still saves.
4. Login as Manager and Order Handler: everything else still works.
5. `make test` and the web build pass.

---

## Part 3: scan → analysing → skin tone result → picks for that tone, by gender

### 3.1 What already exists (reuse it, do not rebuild)

| Piece | Where |
| --- | --- |
| Scan page with camera (multi-frame), single photo upload, manual tone picker, photo quality gate and retake messages | `components/FaceScanView.tsx` (39 KB), route `/scanner` (also `/scan`) |
| Scan and manual APIs | `POST /api/scanner/analyze/`, `POST /api/scanner/manual/` (`scanner/urls.py`) |
| Result data: depth Fair / Medium / Dark, Monk 1 to 10, undertone, confidence | `scanner/engine/*` (unchanged) |
| Colour palettes per tone (best / good / avoid), admin-editable | `recommender` `ToneColorRule`, "Skin Tone Matrix" admin section |
| Ranking and looks | `recommender/engine/ranker.py`, `looks.py`, `/api/recommendations/` |
| Product slots and gender | `catalog` models, `catalog/taxonomy.py`, `catalog/engine/kinds.py`, `families.py` (colour families) |
| Dressing room with gender and skin switches | `/mannequin`, `features/mannequin/dressingRoom.ts` |
| Profile gender | `accounts` `UserProfile` (migration 0002 added gender) |

Plan 13 (face scan v2) also touches the scan page and result screen. Check `docs/STATUS.md` and `docs/plans/TASKS.md` for what of plan 13 is already merged, and build on it. Do not duplicate or fight it. If plan 13 Part D (the result screen with colour scheme) is already in the code, the new result page keeps its pieces (swatch, undertone, "Not right? Choose mine").

### 3.2 The flow the user asked for

1. **Pick who you are shopping for.** At the top of `/scanner`, before any scan: two big choices, **Men** and **Women**. Prefill from the profile gender when the user is logged in and has one. The camera and upload buttons stay disabled until a choice exists. Save the choice to the profile when logged in and to the local store otherwise.
   - Decision (lead): we **ask**, we do not detect gender from the face. A gender guess from a photo is unreliable, can misgender people, needs another model and is not something we want to defend in the viva. The result is the same for the requirement "a man sees only men's clothes, a woman sees only women's clothes".
   - Check what values the profile and the products use for gender (men, women, unisex or similar) and map between them in one place.
2. **Scan or upload.** Unchanged: camera or photo upload, same quality gate. A photo that fails the gate shows the existing retake guidance and never reaches the result page.
3. **Analysing screen, 2 to 3 seconds.** After capture or upload, show a clear "Analysing your skin tone" screen: a face-oval or scanner animation and three short steps that tick off ("Finding your face", "Reading your skin tone", "Matching outfits"). Rules:
   - It lasts at least about 2 seconds so it does not flash, and about 3 seconds at most when the server is fast. If the server is slower, keep the screen up until the answer arrives, no fake result, no extra padding past it.
   - The server response decides the outcome. Success goes to the result page; a gate failure or error goes back to the scan page with the message.
   - Respect reduced-motion settings (no animation, text steps only).
4. **Result page** (new route, `/scanner/result`):
   - Headline: **Your skin tone: Fair**, **Medium** or **Dark** (the three classes in the FYP document), large, with the swatch colour, the undertone as a small chip, and the confidence word (high / medium / low, not a raw percentage).
   - "Not right? Choose mine": Fair / Medium / Dark buttons that change the page in place (calls the existing manual endpoint, no rescan).
   - **Picked for you** section titled with the gender and tone, for example "Men's picks for Fair skin". Four groups, **two products each**:
     - Men: Shirts, Pants, Caps, Glasses.
     - Women: Tops (shirts and kurtas), Bottoms, Caps, Glasses.
   - Each product card: photo (use the existing `ProductImage`), name, price, colour chip; tap opens the product page. A small "Try on mannequin" link carries `gender` and `skin` to `/mannequin` so it opens on the right base.
   - Buttons under the groups: "See all my matches" (goes to `/recommended` with the palette theme and the chosen gender), "Open dressing room", "Scan again".
   - Opening the page with no saved scan sends the user to `/scanner`. A page reload keeps the result (read it from the same place `FaceScanView` already saves it: profile and/or local store; follow the existing pattern).
   - Phone first: check at 390 px wide.
5. The old inline result block in `FaceScanView` is replaced by navigation to this page. Reuse its pieces by moving them into small components (for example the result header, the picks grid, the analysing screen) in their own files; do not let `FaceScanView.tsx` grow.

### 3.3 Picks logic (backend)

New read-only endpoint, public like the other recommendation reads: `GET /api/recommendations/tone-picks/` taking `tone` (fair, medium, dark), `gender` (men, women) and optionally `undertone`. It follows the layered rules in `CLAUDE.md`: thin view, a selector or service, the ranking itself as pure Python in `recommender/engine/`.

Response (describe in the serializer, tested): the tone and gender used, the undertone used, and a list of four groups. Each group has a key, a label, the slot(s) it covers and up to two products in the same card shape the shop already returns. Also a list of group keys that came back with fewer than two products, so the UI can say "more coming soon" and the team can see the gap.

Group to slot mapping (confirm the exact slot names in the code):

| Group | Slot |
| --- | --- |
| Shirts (men) | top |
| Tops (women) | top and kurta |
| Pants (men) / Bottoms (women) | bottom |
| Caps | headwear |
| Glasses | eyewear |

Selection rules, in this order, all deterministic (same input, same output, no randomness):

1. **Eligible**: active, not draft, in stock, matching slot, and gender equal to the chosen one or unisex. **A men's request never returns a women's product and the other way round.** This is a hard rule with its own tests, and it is never relaxed to fill a group.
2. **Tone fit**: if the product has a `compatible_skin_tone` value that excludes the tone, drop it (confirm how that field works first).
3. **Colour fit** using the tone's palette from the existing rules (use the undertone from the scan when given, otherwise whatever the existing palette function does without one): best colours first, then good, then neutral. Colours marked avoid are never picked while any non-avoid product exists.
4. **Variety**: the two picks in a group should be different colour families when possible (see `catalog/engine/families.py`).
5. **Stable tie-break**: products with a mannequin render first, then lowest id.
6. A group with fewer than two eligible products shows what exists and is listed as short. If a group would be short only because of rule 3, fill from non-avoid products regardless of palette before giving up.

Management command `audit_tone_picks` (read-only): prints a table for every gender × tone × group with the number of eligible products and the names of the two picked. Run it for real and paste the output into the report. This is how the team learns which products are missing (women's caps and glasses are the likely gaps). Do not seed placeholder products to hide a gap.

Also make the existing recommendations page honour the chosen gender: `/recommended` and its API call must filter to that gender too (check whether `TopPicksAPIView` already takes a gender parameter and the web call passes it; add it if not). The user's rule is "only men's clothes if a man scanned".

### 3.4 Web wiring

- API function and types for the new endpoint in `features/recommender/api.ts` (or a new file in the same feature); one hook that returns the groups, loading and error states.
- Gender choice helper in `features/scanner/` with the mapping between profile, local store and API values.
- New route `app/scanner/result/page.tsx` that only composes components (as the other pages do). Components in `components/`, no fetch calls inside them.
- `/scan` and `/scanner` keep working; update any link or redirect that pointed at the old inline result.
- Keep every existing scanner state: camera denied, no face found, retake guidance, manual fallback.

### 3.5 Tests (same commit)

Backend (pytest):
- Endpoint status codes and response shape for each tone and both genders.
- Gender strictness: with products of both genders in the same slot, men never see women's items and the reverse; unisex shows for both.
- Exactly two per group when enough products exist, fewer plus the "short" list when not.
- Deterministic: two calls give the same list; avoid colours never chosen while alternatives exist; the two picks differ in colour family when possible.
- Different tones can give different picks when the palettes differ (build the fixtures to prove it).
- Bad input (unknown tone or gender) returns the standard error shape.
- The audit command runs on a small fixture.
- `/recommended` API honours the gender.

Frontend (vitest):
- Gender choice mapping, including a profile with no gender.
- The analysing screen timing rule (use fake timers: not before about 2 s, waits for a slow response, never shows a result on failure).
- Result page renders the four groups, the short-group note, the manual override and the redirect when there is no saved scan.
- Update any existing test and e2e spec (`08-scanner-v2`, `07-demo-flow`) that expected the old inline result; do not run the e2e specs.

### 3.6 Manual acceptance (do this in the browser and report each line)

1. Open `/scanner` logged out and logged in. Camera and upload are locked until Men or Women is chosen; a logged-in user with a profile gender sees it prefilled.
2. Choose Men, upload a good daylight photo: analysing screen for roughly 2 to 3 seconds, then the result page with Fair, Medium or Dark and men's picks only (two shirts, two pants, two caps, two glasses where the catalog has them).
3. Repeat with Women: only women's products.
4. Use "Not right? Choose mine" to switch to each of Fair, Medium and Dark: the picks update and the products are different where the palettes differ.
5. Upload a bad photo (dark or yellow light): the retake message, no result page.
6. Refresh the result page: it stays. Open it in a fresh private window: it sends you to `/scanner`.
7. "See all my matches" shows only the chosen gender.
8. Phone width (390 px): nothing overflows, cards are tappable.
9. Run `audit_tone_picks` and paste the real table.

### Out of scope

Detecting gender from the face, new AI models, changing the skin tone maths, an admin screen for hand-picking the two items (possible later), shoes and watches in the picks, any deployment or payment work.
