# Plan 15: auto gender suggestion and the project documentation guide

Written 2026-11-26, the day before the FYP re-evaluation. Part A is implemented now; Part B is the
documentation plan to write after the demo.

## Part A: auto gender suggestion (implemented)

### Why

The supervisor asked why the scanner makes the shopper choose Men or Women before it can read the face.
The skin-tone model itself is unchanged. A second, small classifier reads the same face crop and only
*suggests* the shop section; the shopper can always override it.

### How it works

1. MediaPipe still finds the 478 face landmarks and the existing photo quality gate still runs first.
2. The face landmarks are expanded into a square crop (1.25× the landmark box) with edge replication.
3. The crop is resized to 224 × 224, converted to RGB and normalised to [-1, 1].
4. A quantised ViT classifier (`rizvandwiki/gender-classification`, ONNX conversion by
   `onnx-community/gender-classification-ONNX`) returns two logits: 0 = female, 1 = male.
5. Each usable frame gets a prediction. The scan combines them with a confidence-weighted mean.
   Agreement between frames lowers the reported confidence; one frame cannot look as certain as six.
6. The scan API returns `gender_detection`: suggested section, probabilities, confidence,
   confidence label, frame agreement, frames used, model name and plain-language reasons.
7. The scanner has no section selector: it always starts from Auto. If confidence is at least 60% the
   result opens directly with the suggestion shown. Below that, or when the model is missing, the
   scanner asks one Men/Women question and never silently guesses. A manual section chosen on the result
   is remembered locally and on the profile; an auto suggestion is never saved to the profile. The
   manual tone fallback asks for a section inside its own panel because there is no photo to read.
8. The result header shows the section and its confidence and has a "Change section" control that
   updates the picks in place.

Skin-tone maths in `scanner/engine/*` is untouched. A missing gender model never blocks a scan.
The photo is still never stored.

### Files

- `apps/server/scanner/engine/gender.py`: crop, ONNX session, softmax, frame aggregation, reasons.
- `apps/server/scanner/engine/pipeline.py`: optional per-frame gender prediction; aggregation in
  `consensus`.
- `apps/server/scanner/services.py`: cached model loader, `gender_detection` payload.
- `apps/server/scanner/views.py`: response field.
- `apps/server/core/management/commands/download_models.py`: downloads `gender/gender_vit.onnx`.
- `apps/server/requirements.txt`: explicit `onnxruntime`.
- `apps/server/scanner/tests/test_gender.py`, `test_real_models.py`, `test_scan_api.py`.
- Web: `features/scanner/api.ts`, `savedScan.ts`, `gender.ts`, `components/scanner/GenderSuggestion.tsx`, `ResultHeader.tsx`, `FaceScanView.tsx`, `ScannerResultView.tsx`.
- E2E specs `07-demo-flow` and `08-scanner-v2` updated (not run).

### Evidence to collect

- Run `make models`, then `make test-models` for the real male portrait test.
- Run `evaluate_gender` (to be written) on a labelled, consenting set; report accuracy with a 95%
  confidence interval, precision/recall/F1, confusion matrix, accuracy by lighting and skin tone,
  calibration/ECE, abstention rate and CPU latency.
- Until that exists, the only measured evidence is a local benchmark on 137 faces found in the Kaggle
  fashion product photos with the product's `gender` label (61 men, 76 women): **137/137 correct**.
  This is a noisy proxy, not a validation set. Do not present it as model accuracy for real shoppers.
- CPU latency on this machine: mean 227–233 ms per frame, p95 about 272 ms; six frames add about 1.4 s.

### Known limits

- The model describes visual appearance, not identity. It can be wrong, and some people will not fit
  a binary label. The manual override is the safety net.
- Confidence is model probability × frame agreement, not a calibrated accuracy. It must not be quoted
  as "98% accurate".
- The model file is downloaded, not committed. A machine without `make models` gets the manual
  question instead of a failed scan.

## Part B: project documentation guide (write after the demo)

### Outputs

- Markdown chapters in `extras/documentation/`, each with Mermaid diagrams and screenshots.
- A README index plus Mermaid sources embedded in each chapter; screenshots later under `extras/documentation/assets/screenshots/`.
- Rendered DOCX and PDF for submission (Pandoc + Mermaid CLI; add a `make guide` target later).

### Chapters

1. **Introduction** — problem (people do not know which colours suit them), USPs (skin-tone scan,
   tone-aware picks, outfit completion, mannequin), scope, objectives, report structure.
2. **Software requirements** — stakeholders, functional requirements FR-01… with a small use-case
   diagram each, non-functional requirements, constraints, assumptions, traceability matrix
   (requirement → code → test).
3. **Use cases** — shopper, staff, admin; main success scenarios for scan → result → picks, complete
   outfit, cart/checkout, staff catalogue, mannequin; include use-case diagrams.
4. **System design** — architecture, ERD and data dictionary generated from Django models, class
   diagram, sequence diagrams (scan, tone picks, checkout), operation contracts, activity diagrams,
   state diagrams (scan and order), component diagram, deployment diagram, DFD levels 0/1/2.
5. **Implementation** — stack, scanner pipeline with thresholds and why, gender suggestion, palette
   and ranker, API contracts, frontend structure, security/RBAC, media pipeline, seed scripts.
6. **Testing and evaluation** — unit/integration/E2E results copied from real runs, scanner quality
   evaluation, gender evaluation with the tables above, performance, limitations, user-study results
   if run, threats to validity.
7. **Conclusion and future work** — what was delivered, what was measured, honest gaps, next steps.
8. **References and appendices** — papers, datasets, model licences, API examples, screenshots, setup.

### Writing order and evidence rules

1. Chapter 4 (design) → 2 (requirements) → 3 (use cases) → 5 (implementation) → 6 (testing) → 1/7/8.
2. Every number comes from a command output or a test run; never invent accuracy, timings or user
   feedback.
3. Reuse `docs/STATUS.md`, `docs/SETUP.md`, plans 13/14 and the test suites as source material.
4. Keep screenshots at 1440 px desktop and 390 px phone; capture the scan, result, recommended,
   mannequin, cart and admin pages.
5. Add `make guide` only after the text is stable; it should fail loudly if Mermaid or Pandoc is absent.

### Estimate

First complete draft: 8–12 working days. Chapter 4 diagrams are the long pole; chapter 6 needs the
gender evaluation set and a real user study to be credible.
