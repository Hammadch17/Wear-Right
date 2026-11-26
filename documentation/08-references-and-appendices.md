# Chapter 8 — References and Appendices

## 8.1 References

1. Chardon, A., Cretois, I., & Hourseau, C. (1991). Skin colour typology and suntanning pathways. *International Journal of Cosmetic Science*, 13(4), 191–208. https://doi.org/10.1111/j.1467-2494.1991.tb00561.x
2. Sharma, G., Wu, W., & Dalal, E. N. (2005). The CIEDE2000 color-difference formula: Implementation notes, supplementary test data, and mathematical observations. *Color Research & Application*, 30(1), 21–30.
3. Google. (2024). *Monk Skin Tone Scale*. https://skintone.google/
4. Google AI Edge. (2024). *MediaPipe Face Landmarker*. https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker
5. Microsoft. (2024). *ONNX Runtime documentation*. https://onnxruntime.ai/docs/
6. Django Software Foundation. (2025). *Django 5.2 documentation*. https://docs.djangoproject.com/en/5.2/
7. Encode OSS. (2025). *Django REST framework documentation*. https://www.django-rest-framework.org/
8. Vercel. (2025). *Next.js documentation*. https://nextjs.org/docs
9. Meta. (2025). *React documentation*. https://react.dev/
10. Tailwind Labs. (2025). *Tailwind CSS v4 documentation*. https://tailwindcss.com/docs
11. PostgreSQL Global Development Group. (2025). *PostgreSQL 17 documentation*. https://www.postgresql.org/docs/17/
12. pgvector. (2025). *Open-source vector similarity search for PostgreSQL*. https://github.com/pgvector/pgvector
13. Kaggle. (2019). *Fashion Product Images Dataset*. https://www.kaggle.com/datasets/paramaggarwal/fashion-product-images-dataset
14. rizvandwiki. (2023). *Gender classification model card*. https://huggingface.co/rizvandwiki/gender-classification
15. onnx-community. (2024). *gender-classification-ONNX*. https://huggingface.co/onnx-community/gender-classification-ONNX
16. ISO/IEC. (2023). *ISO/IEC 25010: Systems and software Quality Requirements and Evaluation — Quality model*.
17. OWASP Foundation. (2024). *OWASP Application Security Verification Standard*. https://owasp.org/www-project-application-security-verification-standard/
18. Playwright. (2025). *Playwright documentation*. https://playwright.dev/
19. Vitest. (2025). *Vitest documentation*. https://vitest.dev/
20. pytest. (2025). *pytest documentation*. https://docs.pytest.org/

## 8.2 Model and dataset licences

| Asset | Source | Licence / use |
| --- | --- | --- |
| MediaPipe Face Landmarker | Google AI Edge | Apache 2.0 model bundle; downloaded by `npm run models`. |
| ViT gender classifier | rizvandwiki / onnx-community conversion | See the Hugging Face model card before redistribution. |
| rembg isnet-general-use | danielgatis/rembg | MIT project; model card terms apply. |
| rembg u2net_cloth_seg | rembg model collection | Used for garment segmentation during mannequin import. |
| Fashion Product Images | Kaggle / Param Aggarwal | Dataset terms; images are for this FYP demonstration, not resale. |
| Mannequin alpha kit | Project-created renders | Stored outside git with the team's media. |

The gender model is optional. A missing model does not prevent scanning.

## 8.3 Appendix A — Main API examples

### A.1 Register

```http
POST /api/auth/register/
Content-Type: application/json

{
  "name": "Demo Shopper",
  "email": "demo@example.com",
  "password": "demo12345",
  "password_confirm": "demo12345"
}
```

Cookies `wr-access` and `wr-refresh` are set httpOnly on success.

### A.2 Scan

```http
POST /api/scanner/analyze/
Content-Type: multipart/form-data

image=<file>
```

Success: `200` with `depth`, `undertone`, `confidence`, `monk`, `quality`, `palette`, and `gender_detection`.
Unusable photo: `422` with `status: "failed"`, `reason`, `message` and `quality.checks`.

### A.3 Manual tone

```http
POST /api/scanner/manual/
Content-Type: application/json

{ "depth": "Medium", "undertone": "neutral" }
```

### A.4 Tone picks

```http
GET /api/recommendations/tone-picks/?tone=fair&gender=women&undertone=warm
```

Invalid input returns `400`:

```json
{ "status": "error", "message": "gender must be men or women" }
```

### A.5 Complete look

```http
GET /api/looks/complete/?product_id=42&depth=Medium&undertone=warm&gender=men
```

### A.6 Add to cart and checkout

```http
POST /api/cart/
{ "product_id": 42, "size": "M", "quantity": 1 }
```

```http
POST /api/checkout/
{
  "customer_name": "Demo Shopper",
  "customer_phone": "03000000000",
  "customer_address": "House 1, Street 2",
  "city": "Lahore",
  "payment_method": "cod"
}
```

## 8.4 Appendix B — Environment variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `SECRET_KEY` | Django signing key | Required in production mode |
| `DEBUG` | Debug mode | `False` |
| `ALLOWED_HOSTS` | Accepted host names | Localhost in debug; required otherwise |
| `DATABASE_URL` | PostgreSQL connection | `postgres://wearright:wearright@localhost:5433/wearright` |
| `MEDIA_ROOT` | Product and mannequin files | `~/wear-right-data/media` when present |
| `ML_MODELS_DIR` | Model weights | `apps/server/ml_models` |
| `SERVE_MEDIA` | Serve `/media` from Django | `True` |
| `CSRF_TRUSTED_ORIGINS` | Trusted browser origins | `http://localhost:3000` |
| `FRONTEND_URL` | Links in emails | `http://localhost:3000` |
| `DEMO_ADMIN_PASSWORD` | Seed admin password | Set for demo |
| `SHOP_MANNEQUIN_ONLY` | Limit shop to mannequin-ready items | Off |

## 8.5 Appendix C — Operating commands

```bash
npm run setup          # complete new-machine setup
npm run run-prod       # start the production-style demo
npm run build          # rebuild the web app
npm run seed           # database + demo data + mannequin
npm run models         # download missing AI models
npm run db:up          # start Postgres and Mailpit
npm run db:down        # stop containers
npm run db:reset       # delete database volume
npm run dev            # hot-reload development
npm run test           # backend + web tests
npm run doctor         # show environment state
```

Backend-only commands:

```bash
apps/server/venv/bin/python apps/server/manage.py migrate
apps/server/venv/bin/python apps/server/manage.py seed_products
apps/server/venv/bin/python apps/server/manage.py download_models
apps/server/venv/bin/python apps/server/manage.py audit_tone_picks
apps/server/venv/bin/python apps/server/manage.py check_media
apps/server/venv/bin/python apps/server/manage.py prepare_mannequin_assets
apps/server/venv/bin/python apps/server/manage.py import_alpha_mannequin --source extras/mannequin-alpha-kit --gender men
```

## 8.6 Appendix D — Demo accounts

| Role | Login | Password |
| --- | --- | --- |
| Customer | `demo@wearright.local` | `demo12345` |
| Admin | `admin@wearright.com` | `admin123` |
| Legacy admin | `admin` | `admin12345` |

Shopper and admin accounts are separate. The admin login is `/admin/login`.

## 8.7 Appendix E — Glossary

| Term | Meaning |
| --- | --- |
| ITA | Individual Typology Angle, a lightness measure from CIELAB. |
| CIEDE2000 | Perceptual colour-difference formula. |
| Monk tone | 1–10 swatch from the Monk Skin Tone Scale. |
| Palette | Best/good/avoid colour scores for a depth × undertone. |
| Anchor | The product an outfit is built around. |
| Tone picks | Two products per group for one gender and tone. |
| Short group | A group with fewer than two eligible products. |
| Mannequin layer | Transparent garment image aligned to a base photo. |
| RBAC | Role-based access control. |
| SavedScan | Browser-local tone result used by `/scanner/result`. |

## 8.8 Appendix F — Document control

| Item | Value |
| --- | --- |
| Project | Wear Right — FYP, University of Lahore |
| Document set | Chapters 1–8 |
| Source of truth | This repository at the implementation commit |
| Evidence rule | Every number comes from a command output, test run or documented manual check. |
| Screenshots | To be captured at 1440 px desktop and 390 px phone for final submission. |
| Known unverified items | E2E suite after final scanner change; skin-tone accuracy; user study. |

## 8.9 Appendix G — Screenshot checklist

| Page | Desktop | Phone |
| --- | --- | --- |
| Home | ☐ | ☐ |
| Shop / filters | ☐ | ☐ |
| Scanner idle | ☐ | ☐ |
| Analysing | ☐ | — |
| Result with four groups | ☐ | ☐ |
| Recommended products | ☐ | ☐ |
| Complete outfit | ☐ | ☐ |
| Dressing room | ☐ | ☐ |
| Cart / checkout | ☐ | ☐ |
| Admin products / tone matrix / mannequin | ☐ | — |

These boxes are intentionally empty: screenshots should be captured from the running build, not fabricated.
