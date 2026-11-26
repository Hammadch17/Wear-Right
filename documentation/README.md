# Wear Right — FYP Documentation

This folder contains the full project report, split into one Markdown file per chapter.

| Chapter | File | Contents |
| --- | --- | --- |
| 1 | [01-introduction.md](01-introduction.md) | Background, problem, solution, USPs, scope, objectives, report structure |
| 2 | [02-requirements.md](02-requirements.md) | Stakeholders, 30 functional requirements, non-functional requirements, constraints, traceability |
| 3 | [03-use-cases.md](03-use-cases.md) | Actors, use-case diagram, nine scenarios, requirement mapping |
| 4 | [04-system-design.md](04-system-design.md) | Architecture, ERD, data dictionary, class diagram, sequence/activity/state/component/deployment diagrams, contracts, DFD levels |
| 5 | [05-implementation.md](05-implementation.md) | Stack, scanner maths and thresholds, gender model, palette/ranker, tone picks, API contracts, frontend, security, media, setup |
| 6 | [06-testing-and-evaluation.md](06-testing-and-evaluation.md) | Test strategy, real results, tone-pick audit, gender benchmark, manual checks, limitations, threats to validity |
| 7 | [07-conclusion-and-future-work.md](07-conclusion-and-future-work.md) | Delivered outcomes, measured claims, honest gaps, future work |
| 8 | [08-references-and-appendices.md](08-references-and-appendices.md) | References, licences, API examples, environment variables, commands, logins, glossary, screenshot checklist |

## Evidence rules used

- Numbers come from actual test runs, command outputs or documented manual checks.
- The skin-tone algorithm has **not** been validated on a labelled dataset; the documents say so.
- The 137-face gender benchmark is described as a noisy proxy, **not** shopper accuracy.
- Playwright specs were rewritten but not executed after the final scanner change; this is stated explicitly.
- No products, prices or accuracy figures were invented.

## Diagrams

All diagrams are Mermaid blocks next to the text, so they render on GitHub, GitLab and most Markdown editors. To export the report:

```bash
# Example: install the tools once
npm install -g @mermaid-js/mermaid-cli
# Optional: pandoc is installed separately

# Render individual diagrams
mmdc -i chapter.mmd -o chapter.svg
```

For DOCX/PDF submission, combine the Markdown chapters with Pandoc and render Mermaid blocks to SVG/PNG first. Keep the generated files in a build folder so the source stays readable.

## Screenshots

The screenshot checklist is in Chapter 8. Capture the real running app at:

- desktop: 1440 px wide;
- phone: 390 px wide.

Do not use mockups in the evaluation chapter.

## Source of truth

The implementation is in `apps/server` (Django) and `apps/web` (Next.js). Setup and operation are documented in the repository root `GUIDE.md` and `docs/WINDOWS.md`.
