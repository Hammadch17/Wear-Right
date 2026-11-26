# Chapter 6 — Testing and Evaluation

## 6.1 Test strategy

| Level | Tool | What it proves |
| --- | --- | --- |
| Pure engine unit tests | pytest | Colour maths, quality gate, ranking, looks, tone picks without a database. |
| API/integration tests | pytest + DRF APIClient | Request validation, permissions, serializers, database effects. |
| Frontend unit/component tests | Vitest + Testing Library | Gender mapping, analysing timing, result page, cart, auth, mannequin logic. |
| Type and lint gates | `tsc --noEmit`, ESLint | Type safety and common React defects. |
| Production build | `next build` | The app compiles and all routes can be generated. |
| Real-model tests | pytest `-m models` | MediaPipe/ONNX files load and produce plausible output. |
| Manual acceptance | Browser at 1440 px and 390 px | The actual demo journey works with real data and media. |
| E2E | Playwright | Full browser journey. **Not run for the final scanner change.** |

## 6.2 Automated results

### Backend

Last full `make test` run after the auto-gender feature:

```text
651 passed in 184.72s
```

This includes the scanner suite and the new tone-picks tests. The scanner-focused run was:

```text
105 passed
```

The tone-picks file specifically:

```text
15 passed
```

Real-model tests:

```text
8 passed
```

These load the actual MediaPipe Face Landmarker and ONNX gender model; they are not mocked.

### Web

```text
Test Files  23 passed (23)
Tests       158 passed (158)
```

`tsc --noEmit` completed with no errors. ESLint reported **0 errors** and one known pre-existing unused-disable warning in `AdminView.tsx`. The production build passed after the expected first-run Next.js 16 security advisory retry; the route list includes `/scanner` and `/scanner/result`.

### E2E status

`e2e/08-scanner-v2.spec.ts` and `e2e/07-demo-flow.spec.ts` were rewritten for the new result route and auto-gender flow, but **Playwright was not run** after that change because the project rule for this task forbade it. They must not be reported as passing.

## 6.3 Unit/integration coverage by area

| Area | Representative tests | Result |
| --- | --- | --- |
| Skin maths | `test_skin.py`, `test_pipeline.py` | Pass |
| Quality gate | `test_quality.py`, `test_quality_api.py` | Pass |
| Gender engine | `test_gender.py` | Pass |
| Scan API | `test_scan_api.py` | Pass |
| Tone picks | `test_tone_picks.py` | 15 pass |
| Ranker/looks | `test_ranker.py`, `test_looks.py` | Pass |
| Recommender API | `test_recommender_api.py` | Pass |
| Mannequin import | `test_alpha_import.py`, media tests | Pass |
| Auth/RBAC | `accounts/tests/`, `staff/tests/test_rbac.py` | Pass |
| Cart/checkout | `orders/tests/` | Pass |
| Frontend scanner helpers | `gender.test.ts`, `analysing.test.ts` | Pass |
| Result page | `ScannerResultView.test.tsx` | Pass |
| Mannequin helpers | `dressingRoom.test.ts` | Pass |

## 6.4 Tone-pick audit

Command:

```bash
apps/server/venv/bin/python apps/server/manage.py audit_tone_picks
```

The command is read-only. Last recorded eligible counts:

| Gender | Tone | Shirts/Tops | Pants/Bottoms | Caps | Glasses |
| --- | --- | ---: | ---: | ---: | ---: |
| Men | Fair | 19 | 27 | 11 | 11 |
| Men | Medium | 18 | 28 | 11 | 11 |
| Men | Dark | 18 | 27 | 11 | 11 |
| Women | Fair | 38 | 30 | 10 | 10 |
| Women | Medium | 39 | 30 | 10 | 10 |
| Women | Dark | 38 | 30 | 10 | 10 |

Every group currently has at least two eligible products, so `short_groups` is empty on the real catalogue. A short group is still supported and tested with synthetic catalogues.

Example picks from the real audit:

| Gender / tone | Shirts/Tops | Pants/Bottoms | Caps | Glasses |
| --- | --- | --- | --- | --- |
| Men / Fair | ADIDAS Mens Fitted Black T-shirt; Tantra Unisex Printed Blue Tshirts | Black Formal Trouser; Locomotive Men Loco Denims Blue Jeans | Nike Unisex Rodger Federer Blue Grey White Cap; ADIDAS Unisex Blue Cap | Idee Men Black Sunglasses; Ray-Ban Men Aviator Gold Sunglasses |
| Women / Dark | Women Western Tunic Kurta; BIBA Women Printed Green Kurta | Nike / Urban Yoga track pants | ADIDAS / UCB women's caps | Idee Women sunglasses |

The audit exposes catalogue gaps rather than hiding them. Products are added in the admin panel; the command never creates placeholders.

## 6.5 Scanner quality evidence

### What is measured

- Photo-quality checks are unit-tested with synthetic and real images.
- Real-model tests confirm the model loads and returns a plausible tone.
- Manual checks confirm bad photos stay on the scanner with a retake message.

### What is not measured

There is **no labelled skin-tone validation set** in the project. Therefore:

- no claim of skin-tone accuracy, precision or bias by depth;
- no claim that thresholds are clinically correct;
- no comparison against a dermatologist or colorimeter.

The thresholds are documented starting values. `evaluate_skin_tone` exists as a command path, but a credible evaluation needs consented labelled photos across lighting and depth.

## 6.6 Gender suggestion evidence

A local benchmark used **137 faces** found in Kaggle fashion product images and labelled by the product's gender:

| Label | Faces | Correct | Notes |
| --- | ---: | ---: | --- |
| Male-labelled | 61 | 61 | Noisy product-level label |
| Female-labelled | 76 | 76 | Noisy product-level label |
| **Total** | **137** | **137** | 100% on this proxy |

Mean model confidence was approximately **97.9%** for male-labelled and **98.7%** for female-labelled faces.

**This is not a validation set.** Product gender is not the model's target, faces are not consented portraits, and the set does not cover lighting, age or skin-tone balance. It must be described as a smoke benchmark, never as shopper accuracy.

Performance:

- ONNX CPU inference: **227–233 ms per frame**.
- Six-frame scan therefore spends roughly 1.4 s in gender inference, plus MediaPipe and skin maths.
- A single-frame upload is faster.

The scanner's reported confidence is a model probability adjusted by frame agreement, not a calibrated probability. It is shown as high/medium/low with a percentage, and the shopper can override it.

## 6.7 Manual acceptance checks

The nine checks from the plan were run on the real app:

| # | Check | Result |
| --- | --- | --- |
| 1 | `/scanner` has no mandatory gender gate; camera/upload are unlocked | Passed: no selector, upload enabled, low-confidence path asks for a section. |
| 2 | Real male photo → analysing → men's result | Passed: Fair, `Men's section · 89% sure`, four groups, eight cards. |
| 3 | Female photo → women's products only | Passed: Medium tone, women's heading and cards. |
| 4 | Change tone in place | Passed: Fair/Medium/Dark switch updates heading and groups without rescanning. |
| 5 | Bad photo gives a retake, no result page | Passed: stayed on `/scanner`, “Image could not be processed.”, no result. |
| 6 | Reload keeps result; fresh storage redirects | Passed. |
| 7 | “See all matches” honours gender | Passed: women-only request and cards. |
| 8 | 390 px no horizontal overflow | Passed: viewport 390, scroll width 375. |
| 9 | Audit command output | Passed, table above. |

Screenshots should be captured at 1440 px and 390 px for the final submission; they are not embedded in this draft.

## 6.8 Performance and reliability

| Metric | Observed |
| --- | --- |
| Gender inference | 227–233 ms/frame on the development laptop |
| Analysing screen | 2.2 s minimum; waits for a slower server |
| Production start | Next ready in ~150 ms; Django system check clean |
| Build | Passes; first attempt may stop once for the Next security advisory and the task runner retries |
| Media | Product and mannequin files served through the Next proxy; missing files show a placeholder |

Reliability cases tested:

- no face → 422 retake;
- yellow/blue light, side light or turned head → fail/warn with message;
- missing gender model → scan still returns tone, asks for a section;
- direct result page without storage → redirect to scanner;
- missing mannequin layer variant → wheatish fallback;
- out-of-stock/draft product → excluded from picks.

## 6.9 Threats to validity

1. **No labelled skin-tone set** — the tone algorithm's real accuracy is unknown.
2. **Noisy gender benchmark** — product labels and internet images are not a fair evaluation.
3. **Small manual sample** — the nine checks show function, not statistical quality.
4. **Catalogue dependence** — tone picks depend on what the team imported; short groups can appear if stock changes.
5. **E2E not run** — automated browser coverage for the final flow is unverified.
6. **CPU timing** — measured on one laptop; other machines may be slower.
7. **Binary gender model** — excludes non-binary identities and may misread appearance; override is essential.

## 6.10 Evaluation summary

The system is functionally complete and the core scientific rules are unit-tested. The strongest evidence is deterministic engine/API testing and the real manual journey. The weakest evidence is model accuracy, especially skin tone, which remains future evaluation work. The report must state this gap plainly rather than quote the 137-face proxy as accuracy.
