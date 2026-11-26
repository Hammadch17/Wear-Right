# Chapter 7 — Conclusion and Future Work

## 7.1 What was delivered

Wear Right is a working local prototype of a skin-tone-aware fashion store. A shopper can open the scanner, use a camera, upload a photo or choose a tone manually, receive a tone result with a confidence and colour palette, browse two picks per garment group for their section, see all recommended products, complete a look, try it on the layered mannequin, add items to a cart and check out.

The store side is equally complete: staff can maintain products, taxonomy, colours, tone rules and mannequin layers, manage orders, and inspect face-scan records under role-based permissions.

Operationally, the project is reproducible on Windows, Linux and macOS through npm commands. `npm run setup` prepares dependencies, environment, database, seed data, mannequin data, models and the production build; `npm run run-prod` starts the demo. This removed the earlier dependence on Bash scripts, which was a practical failure on the Windows demo laptop.

## 7.2 What was measured

| Claim | Evidence | Confidence |
| --- | --- | --- |
| Backend behaviour works | 651 pytest tests passed | High for tested paths |
| Web components work | 158 Vitest tests in 23 files | High for tested components |
| Production build works | Next build passed after advisory retry | High |
| Real models load and return plausible output | 8 real-model tests | Medium |
| Tone picks obey gender and short-group rules | 15 dedicated tests | High |
| Real catalogue has no short groups today | Read-only audit, all groups ≥ 2 | High for current data |
| Gender smoke benchmark | 137/137 on a noisy product-image proxy | Low as a generalisation claim |
| Skin-tone accuracy | Not measured on a labelled set | Unknown |
| End-to-end browser suite | Rewritten, not run | Unverified |

The strongest parts of the evaluation are deterministic engine tests and the manual walkthrough. The weakest are model accuracy and automated browser coverage.

## 7.3 Honest gaps

1. **Skin-tone validation is missing.** The ITA and hue thresholds are reasoned starting values, not measured against a labelled dataset.
2. **Gender is a binary appearance suggestion.** It is not identity, is not calibrated, and should not be described as accurate for shoppers.
3. **E2E tests were not executed** after the result-page and auto-gender changes.
4. **The catalogue has mis-tagged rows.** `Silver Chrono Watch` and a bandana are tagged as caps; the tone-picks engine guards with a name check, but the data should be corrected.
5. **Deployment is local only.** There is no HTTPS, real payment gateway, production web server or object storage.
6. **User study is absent.** No real shoppers were observed or surveyed; the manual checks were developer acceptance tests.
7. **Next.js security advisory.** The installed Next 16.4.1 version triggers an upgrade recommendation; a security upgrade remains pending.

## 7.4 Future work

### Model and evaluation

- Build a consented, labelled skin-tone set across depths, undertones and lighting; report MAE/accuracy, confusion matrices and confidence intervals.
- Calibrate gender confidence with temperature scaling or isotonic regression and report ECE.
- Add `evaluate_gender` with precision/recall/F1, confusion matrix and abstention rate.
- Evaluate fairness by skin depth, lighting and face size.
- Consider an “unsure / prefer not to say” section option and non-binary-inclusive navigation.

### Product and experience

- Improve the cap/eyewear taxonomy so `kind` alone is reliable.
- Add more accessories and complete the women's cap/glasses catalogue.
- Add outfit saving, sharing and side-by-side comparison.
- Add “why this pick” explanations from the actual palette score and colour family.
- Add a real user study with task success, time on task and satisfaction.

### Engineering

- Run and maintain Playwright in CI.
- Replace Django's development server with a production WSGI server and HTTPS.
- Move media to object storage with signed URLs.
- Add structured logging and scan-quality dashboards for staff.
- Upgrade Next.js and keep the dependency advisory gate green.
- Add a Mermaid/Pandoc pipeline for DOCX/PDF generation.

## 7.5 Final statement

The project meets its main functional objective: it turns a face scan or a manual tone choice into a coherent, gender-aware set of products and an outfit that can be visualised and bought. It does so with honest fallbacks and clear failure messages. The remaining work is primarily scientific validation and production hardening, not missing core functionality.
