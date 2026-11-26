# Chapter 1 — Introduction

## 1.1 Background

Most shoppers can tell whether a garment fits, but far fewer can explain why a colour suits them. Advice is scattered across social media, shop assistants and trial and error. The result is wasted money, returned clothes and low confidence in choosing outfits.

Wear Right is a local web application built as a Final Year Project at the University of Lahore. It turns a face photo into a skin-tone reading, explains the colours that suit that tone, recommends real products from the shop catalogue, completes an outfit and shows the look on a layered mannequin. The system is a working prototype for a fashion store, not a public deployment.

## 1.2 Problem statement

A shopper who does not know fashion faces three connected problems:

1. **Diagnosis** — they do not know their skin depth (Fair, Medium or Dark) or undertone (warm, cool or neutral).
2. **Translation** — even with a tone, they do not know which colours, and therefore which products, are likely to suit them.
3. **Completion** — a single recommended shirt is not an outfit; the shopper still has to choose trousers, shoes and accessories that work together.

Existing shop filters answer “what is available?”, not “what suits me?”. Generic colour charts ignore the actual catalogue, while virtual try-on systems require expensive models or specialist hardware.

## 1.3 Proposed solution

Wear Right connects the three problems in one journey:

```text
photo / manual tone
        ↓
skin depth + undertone + photo quality
        ↓
tone-aware colour palette
        ↓
recommended products and two picks per garment group
        ↓
complete outfit (top, bottom, shoes, accessories)
        ↓
layered 2D mannequin
```

The shopper can scan with a camera, upload a photo or choose a tone by hand. A photo quality gate rejects unusable light or poses and gives a specific retake instruction instead of returning a confident wrong answer. The scanner also suggests the men's or women's section from the same face crop, but the shopper can change it; the suggestion is never silently saved as profile gender.

## 1.4 Unique selling points

| USP | What it means in the product |
| --- | --- |
| **Skin-tone-first styling** | Recommendations are driven by measured depth and undertone, not by a generic “best colours” list. |
| **Quality-aware scanning** | Yellow/blue light, side light, blur and head turn are checked before skin colour is measured. |
| **Tone picks, not one item** | After a scan the result page shows two shirts/tops, two trousers/bottoms, two caps and two pairs of glasses for that tone. |
| **Complete outfit** | The look engine fills the missing slots around an anchor product and explains the pairing. |
| **Layered mannequin** | Real product cut-outs are drawn over a base model by gender and skin tone. |
| **Admin-editable rules** | Colours, categories, styles, tone rules and mannequin layers are database rows managed in the admin panel. |
| **Works offline and locally** | Docker, Django and Next.js run on a laptop with no cloud dependency. |

## 1.5 Objectives

1. Detect skin depth and undertone from a face photo with an explicit confidence and a quality explanation.
2. Map a tone to an admin-editable colour palette with best, good and avoid colours.
3. Recommend catalogue products by tone, gender, style and colour, never inventing products or prices.
4. Produce exactly two picks per garment group when the catalogue allows it, and clearly mark short groups when it does not.
5. Complete an outfit around a chosen product and render it on the mannequin.
6. Provide manual fallbacks so the journey works when the camera, model or photo quality fails.
7. Keep the system usable on a normal CPU laptop and on a phone-width screen.

## 1.6 Scope

### In scope

- Customer registration, login, profile and skin-tone storage.
- Camera scan, single-photo upload and manual tone selection.
- Photo quality checks and retake guidance.
- Optional appearance-based gender suggestion with manual override.
- Tone-aware product recommendations and tone picks.
- Complete-look generation and layered mannequin.
- Cart, demo checkout, order history and cancellation.
- Staff/admin catalogue, categories, colours, styles, tone rules, mannequin layers, orders and face-scan records.
- Local setup, seed data, model download and production-style demo scripts.

### Out of scope

- Public deployment, HTTPS, payment-gateway integration and real shipping.
- Native mobile applications.
- Real-time video try-on or generative image try-on.
- Medical or dermatological diagnosis.
- Training a new skin-tone or gender model.
- Storing or reusing face photos after analysis.

## 1.7 Report structure

| Chapter | Content |
| --- | --- |
| 1 | Problem, solution, USPs, scope and objectives. |
| 2 | Stakeholders, functional and non-functional requirements, constraints and traceability. |
| 3 | Actors, use cases and main success scenarios. |
| 4 | Architecture, data model, sequence/activity/state diagrams, contracts and deployment. |
| 5 | Implementation of scanner, recommender, APIs, frontend, security and media. |
| 6 | Test results, model evidence, performance, limitations and threats to validity. |
| 7 | Delivered outcomes, honest gaps and future work. |
| 8 | References, licences, API examples, setup and glossary. |

## 1.8 Terminology

- **Depth** — lightness of skin: Fair, Medium or Dark.
- **Undertone** — warm, cool or neutral hue tendency.
- **Monk tone** — a 1–10 swatch from the Monk Skin Tone Scale used as a second, human-readable reference.
- **ITA** — Individual Typology Angle, a standard measure of skin lightness.
- **Palette** — admin-defined colour scores: best (+2), good (+1), avoid (−2).
- **Tone picks** — two products per garment group selected for one gender and tone.
- **Anchor** — the product the shopper starts an outfit with.
- **Mannequin layer** — a transparent garment image aligned to a base model photo.
