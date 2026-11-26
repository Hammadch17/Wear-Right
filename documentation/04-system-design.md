# Chapter 4 — System Design

## 4.1 Design goals

- Keep skin-tone and recommendation science independent of Django so it can be unit-tested.
- Keep HTTP views thin: validate input, call a service, serialise output.
- Make every rule staff-editable where practical (categories, colours, styles, tone scores, mannequin layers).
- Degrade gracefully: a missing model, photo, mannequin layer or catalogue group must not break the journey.
- Work on a CPU-only demo laptop and a phone-width browser.

## 4.2 High-level architecture

```mermaid
flowchart TB
  subgraph Browser
    UI[Next.js 16 App Router<br/>React 19 + Tailwind v4]
  end

  subgraph WebServer[Next.js server :3000]
    Proxy[Rewrites /api/* and /media/*]
  end

  subgraph API[Django 5 + DRF :8000]
    Auth[Accounts and sessions]
    Catalog[Catalog and mannequin]
    Scanner[Scanner API]
    Rec[Recommender API]
    Orders[Cart / checkout / orders]
    Staff[Admin and RBAC]
  end

  subgraph Engines[Pure Python engines]
    Skin[Face landmarks, quality, colour maths]
    Gender[ONNX gender suggestion]
    Rank[Palette, ranker, looks, tone picks]
  end

  subgraph Data
    DB[(PostgreSQL 17 + pgvector :5433)]
    Media[(MEDIA_ROOT<br/>product and mannequin images)]
    Models[(ML_MODELS_DIR<br/>MediaPipe + ONNX)]
    Mail[(Mailpit :8025)]
  end

  UI --> Proxy
  Proxy --> Auth
  Proxy --> Catalog
  Proxy --> Scanner
  Proxy --> Rec
  Proxy --> Orders
  Proxy --> Staff
  Proxy --> Media
  Auth --> DB
  Catalog --> DB
  Orders --> DB
  Staff --> DB
  Rec --> DB
  Scanner --> Skin
  Scanner --> Gender
  Rec --> Rank
  Skin --> Models
  Gender --> Models
  Catalog --> Media
  Auth --> Mail
```

**Rule:** the browser never calls Django directly; it uses the Next.js rewrite, so cookies remain on one origin.

## 4.3 Domain model

### 4.3.1 Entity–relationship diagram

```mermaid
erDiagram
  USER ||--|| USERPROFILE : has
  USER ||--o{ ORDER : places
  USER ||--|| CART : owns
  USER ||--o{ FACESCANRECORD : scans
  CART ||--o{ CARTITEM : contains
  ORDER ||--o{ ORDERITEM : contains
  PRODUCT ||--o{ CARTITEM : added
  PRODUCT ||--o{ ORDERITEM : sold_as
  CATEGORY ||--o{ PRODUCT : groups
  COLOR ||--o{ PRODUCT : primary_colour
  MANNEQUINBASE ||--o{ MANNEQUINLAYER : supports
  PRODUCT ||--o{ MANNEQUINLAYER : renders
  ADMINROLE ||--o{ ADMINMEMBER : grants
  USER ||--o| ADMINMEMBER : staff_profile

  USER {
    int id PK
    string username
    string email
    string password
    bool is_staff
  }
  USERPROFILE {
    int id PK
    int user_id FK
    string skin_tone
    int monk_tone
    string undertone
    string gender
    string preferred_style
    json favorite_colors
    json avoided_colors
    string top_size
    string bottom_size
    string shoe_size
  }
  PRODUCT {
    int id PK
    string name
    string category
    int category_ref_id FK
    string cultural_tag
    string compatible_skin_tone
    int primary_color_id FK
    string slot
    string gender
    string kind
    int formality
    json style_tags
    string color_name
    string color_hex
    decimal price
    int stock_quantity
    string status
    file image
    bool mannequin_ready
  }
  CATEGORY {
    int id PK
    string name
    string slug
    string slot
    string gender
    string group
    bool is_active
  }
  COLOR {
    int id PK
    string name
    string hex
    string family
  }
  MANNEQUINBASE {
    int id PK
    string gender
    file image
    file image_fair
    file image_dark
    file base_top
    file base_bottom
    bool is_active
  }
  MANNEQUINLAYER {
    int id PK
    int base_id FK
    int product_id FK
    string slot
    file image
    file image_fair
    file image_dark
    bool approved
  }
  CART {
    int id PK
    int user_id FK
  }
  CARTITEM {
    int id PK
    int cart_id FK
    int product_id FK
    string size
    int quantity
  }
  ORDER {
    int id PK
    int user_id FK
    string order_code
    string customer_name
    string customer_email
    string customer_address
    string payment_method
    decimal total_amount
    string order_status
    string payment_status
    datetime order_date
  }
  ORDERITEM {
    int id PK
    int order_id FK
    int product_id FK
    string name
    decimal price
    string size
    int quantity
    decimal line_total
  }
  FACESCANRECORD {
    int id PK
    int user_id FK
    string detected_skin_tone
    float confidence_score
    string lighting_quality
    int monk
    string undertone
    float ita
    float hue
  }
  TONECOLORRULE {
    int id PK
    string depth
    string undertone
    string color_name
    int score
  }
  ADMINROLE {
    int id PK
    string name
    string slug
    json permissions
    bool is_system
  }
  ADMINMEMBER {
    int id PK
    int user_id FK
    int role_id FK
    bool is_active
  }
```

### 4.3.2 Data dictionary

The tables below summarise every persisted model. Common timestamps (`created_at`, `updated_at`) are present on all core models and omitted where they add noise.

#### Accounts — `UserProfile`

| Field | Type | Notes |
| --- | --- | --- |
| id | bigint PK | |
| user | one-to-one → User | One profile per account. |
| skin_tone | char | Fair / Medium / Dark. |
| monk_tone | small int | 0–10; 0/empty when unknown. |
| undertone | char | warm / cool / neutral. |
| cultural_preference | char | Style name such as Western. |
| gender | char | male / female / unspecified. Used only to prefill; auto suggestion is separate. |
| preferred_style | char | casual / formal / eastern. |
| favorite_colors | JSON | Optional preference list. |
| avoided_colors | JSON | Used by the ranker. |
| body_preset | char | slim / regular / plus. |
| top_size, bottom_size, shoe_size | char | Size availability checks. |

#### Catalog — `Product`

| Field | Type | Notes |
| --- | --- | --- |
| id | bigint PK | |
| name, slug | char | Display and URL name. |
| description | text | Product copy. |
| category | char | Legacy category name kept for compatibility. |
| category_ref | FK → Category | Preferred category link. |
| cultural_tag | char | Casual / Formal / Eastern style. |
| style | char | Legacy style field. |
| compatible_skin_tone | char | Fair / Medium / Dark / All. |
| color | char | Legacy colour name. |
| primary_color | FK → Color | Structured colour. |
| garment_type | char | Legacy coarse type. |
| image | file | Product photo under `MEDIA_ROOT`. |
| cost_price, price | decimal | Cost and selling price. |
| stock_quantity | positive int | Total stock. |
| size_s_stock … size_xxl_stock | positive int | Per-size stock. |
| sizes | JSON | Size availability map. |
| status | char | Active / Inactive / Out of Stock / Draft. |
| is_active | bool | Shop visibility flag. |
| external_id | char | Import identifier. |
| slot | char | top / bottom / kurta / outerwear / footwear / accessory / dupatta. |
| gender | char | men / women / unisex. |
| kind | char | 24 garment kinds: tshirt, shirt, polo, kurta, kameez, jacket, blazer, waistcoat, hoodie, jeans, trousers, shorts, shalwar, sneakers, formal_shoes, sandals, boots, watch, belt, tie, cap, sunglasses, bag, dupatta, dress. |
| formality | small int | 1–5, 0 when unknown. |
| style_tags | JSON | Style names for matching. |
| color_name, color_hex | char | Display fallback and palette input. |
| color_palette | JSON | Optional extracted colours. |
| mannequin_image, back_image | file | Optional mannequin assets. |
| mannequin_ready | bool | Layer exists and is drawable. |
| mannequin_note | char | Why a layer was rejected. |

#### Catalog — `Category`, `Color`, `Style`

| Model | Fields |
| --- | --- |
| Category | id, name, slug, slot, gender, group, image, sort_order, is_active |
| Color | id, name, hex, family (white/black/grey/brown/blue/green/red/pink-purple) |
| Style | id, name, slug, sort_order, is_active |

#### Mannequin — `MannequinBase`, `MannequinLayer`

| Model | Fields |
| --- | --- |
| MannequinBase | id, gender (men/women), image, base_top, base_bottom, image_fair, image_dark, width, height, label, source_sha, is_active |
| MannequinLayer | id, base FK, product FK, slot (top/kurta/outerwear/bottom/shoes/watch/eyewear/headwear), image, image_fair, image_dark, source, source_sha, report JSON, approved, note |

#### Orders — `Cart`, `CartItem`, `Order`, `OrderItem`

| Model | Fields |
| --- | --- |
| Cart | id, user one-to-one |
| CartItem | id, cart FK, product FK, size, quantity |
| Order | id, user FK, order_code, customer_name/email/phone/address, city, payment_method, product (legacy), quantity, total_amount, profit_amount, order_status, payment_status, order_date |
| OrderItem | id, order FK, product FK, name, price, size, quantity, line_total |

#### Scanner — `FaceScanRecord`

| Field | Type | Notes |
| --- | --- | --- |
| id | bigint PK | |
| user | FK → User, nullable | Null for a guest scan. |
| visitor_name | char | Optional label. |
| detected_skin_tone | char | Fair / Medium / Dark / Rescan Required / Unknown. |
| confidence_score | float | 0–100. |
| lighting_quality | char | Good / Normal / Low / Too Bright / Too Low. |
| brightness | float | Mean face luminance. |
| monk | small int | Monk swatch 1–10, 0 when unknown. |
| undertone | char | warm / cool / neutral. |
| ita, hue | float | Measurement inputs. |

No photo is stored.

#### Recommender — `ToneColorRule`

| Field | Type | Notes |
| --- | --- | --- |
| depth | char | Fair / Medium / Dark. |
| undertone | char | warm / cool / neutral. |
| color_name | char | Reference colour name. |
| score | small int | +2 best, +1 good, −2 avoid. |

#### Staff — `AdminRole`, `AdminMember`

| Model | Fields |
| --- | --- |
| AdminRole | id, name, slug, description, permissions JSON, is_system |
| AdminMember | id, user one-to-one, role FK, is_active |

#### Legacy

`Booking` remains in the database for historical rows but the admin Bookings section and booking permissions were removed. New bookings are not part of the current journey.

## 4.4 Class diagram

```mermaid
classDiagram
  class FaceDetector {
    +detect(bgr) landmarks
    +close()
  }
  class QualityGate {
    +check_quality(bgr, landmarks, box)
  }
  class SkinMath {
    +bgr_to_lab()
    +ita_degrees()
    +depth_from_ita()
    +undertone_from_hue()
    +nearest_monk()
  }
  class GenderClassifier {
    +predict(bgr, landmarks)
  }
  class Pipeline {
    +analyze_frame(bgr, detector, gender_classifier)
    +consensus(results)
  }
  class Palette {
    +score(name)
    +score_item(item)
    +best(limit)
    +avoid(limit)
  }
  class Ranker {
    +rank(items, profile, palette, limit)
  }
  class LookEngine {
    +complete_look(anchor, items, profile, palette)
  }
  class TonePicks {
    +group_candidates(items, gender)
    +tone_picks(items, tone, gender, palette)
  }
  class Product {
    +id
    +name
    +slot
    +gender
    +kind
    +color_hex
    +price
    +stock_quantity
    +status
  }
  class Item {
    +id
    +slot
    +gender
    +kind
    +is_kids
    +ready
  }
  Pipeline --> FaceDetector
  Pipeline --> QualityGate
  Pipeline --> SkinMath
  Pipeline --> GenderClassifier
  Ranker --> Palette
  Ranker --> Item
  TonePicks --> Palette
  TonePicks --> Item
  LookEngine --> Item
  Product --> Item : adapter
```

## 4.5 Sequence diagrams

### 4.5.1 Photo scan

```mermaid
sequenceDiagram
  actor Shopper
  participant UI as FaceScanView
  participant Proxy as Next proxy
  participant API as Scanner API
  participant P as Pipeline
  participant G as Gender ONNX
  participant DB as PostgreSQL

  Shopper->>UI: Upload photo / capture frames
  UI->>Proxy: POST /api/scanner/analyze/
  Proxy->>API: multipart image(s)
  API->>P: analyze_frame per frame
  P->>P: landmarks, face box, quality gate
  alt quality/face failure
    P-->>API: ok=false + reason + checks
    API-->>UI: 422
    UI-->>Shopper: retake message + manual fallback
  else usable
    P->>P: ITA, hue, Monk, confidence
    P->>G: face crop per frame
    G-->>P: women/men probabilities
    P-->>API: per-frame result
    API->>P: consensus
    P-->>API: depth, undertone, gender_detection
    API->>DB: FaceScanRecord (signed-in only)
    API-->>UI: 200 success
    UI->>UI: wait 2.2 s
    UI-->>Shopper: /scanner/result
  end
```

### 4.5.2 Tone picks

```mermaid
sequenceDiagram
  participant UI as ScannerResultView
  participant API as TonePicksAPIView
  participant S as Service
  participant Sel as Selector
  participant E as tone_picks engine
  participant DB as PostgreSQL

  UI->>API: GET tone-picks?tone=fair&gender=men&undertone=warm
  API->>API: validate tone/gender/undertone
  API->>S: tone_picks(tone, gender, undertone)
  S->>Sel: get_tone_products(tone, gender)
  Sel->>DB: Active, stock>0, gender in (men,unisex), tone in (All,Fair)
  DB-->>Sel: Product rows
  S->>E: Items + palette + gender
  E-->>S: four groups, two items each, short flags
  S-->>API: groups + Product rows
  API-->>UI: JSON with product cards
```

### 4.5.3 Checkout

```mermaid
sequenceDiagram
  actor C as Customer
  participant UI as Checkout page
  participant API as CheckoutAPIView
  participant S as checkout service
  participant DB as PostgreSQL

  C->>UI: Place order
  UI->>API: POST /api/checkout/
  API->>S: validate cart + customer details
  S->>DB: BEGIN; lock products
  S->>DB: check stock and price
  S->>DB: create Order + OrderItems
  S->>DB: decrement stock
  S->>DB: clear cart
  S->>DB: COMMIT
  API-->>UI: order id/code
  UI-->>C: Confirmation
```

## 4.6 Operation contracts

### Contract: `analyze_face_images`

- **Input:** one or more uploaded images; optional signed-in user.
- **Preconditions:** image decodes; scanner model available.
- **Postconditions:** returns per-frame measurements, consensus, palette and optional gender suggestion; a successful signed-in scan may create a `FaceScanRecord` and update profile tone. No photo is stored.
- **Failure:** `ScannerUnavailable` → 503; unusable photo → 422 with reason and quality checks.

### Contract: `tone_picks(tone, gender, undertone)`

- **Input:** tone ∈ Fair/Medium/Dark; gender ∈ men/women; undertone optional.
- **Preconditions:** none beyond valid input.
- **Postconditions:** returns four groups in display order; each group has 0–2 products; `short_groups` lists groups with fewer than two; no product outside the gender or tone filter.
- **Invariants:** deterministic for the same catalogue, palette and input; gender is never relaxed.

### Contract: `complete_look(anchor, items, profile, palette)`

- **Input:** anchor item, eligible items, shopper profile, palette.
- **Postconditions:** fills missing slots with compatible items; never duplicates the anchor slot; returns reasons and total.
- **Invariants:** kids products never enter adult looks; gender compatibility is enforced.

### Contract: `checkout(cart, customer)`

- **Preconditions:** authenticated cart owner; non-empty cart.
- **Postconditions:** exactly one order, one item per cart line, stock decremented atomically, cart cleared.
- **Failure:** insufficient stock → no partial order; transaction rolls back.

## 4.7 Activity diagram — scan journey

```mermaid
flowchart TD
  A[Open /scanner] --> B{Camera or upload}
  B -->|Camera| C[Capture 6 frames]
  B -->|Upload| D[Read one photo]
  C --> E[POST analyze]
  D --> E
  E --> F{Face found?}
  F -->|No| G[422: retake message]
  G --> H[Manual tone panel]
  F -->|Yes| I{Quality gate}
  I -->|Fail| G
  I -->|Pass| J[Skin tone + gender suggestion]
  J --> K[Wait at least 2.2 s]
  K --> L{Confidence >= 60?}
  L -->|Yes| M[/scanner/result/]
  L -->|No| N[Ask Men or Women]
  N --> M
  H --> O[POST manual]
  O --> M
```

## 4.8 State diagrams

### 4.8.1 Scanner state

```mermaid
stateDiagram-v2
  [*] --> idle
  idle --> camera: Start camera
  camera --> scanning: captured frames
  idle --> scanning: upload
  scanning --> complete: usable result
  scanning --> retake: 422 no face/quality
  scanning --> error: network/server error
  retake --> idle: Try again
  complete --> result: navigate
  result --> [*]
```

### 4.8.2 Order state

```mermaid
stateDiagram-v2
  [*] --> Pending: checkout
  Pending --> Confirmed: staff confirm
  Pending --> Cancelled: customer/staff cancel
  Confirmed --> Shipped: staff ship
  Confirmed --> Cancelled: staff cancel
  Shipped --> Delivered: staff deliver
  Delivered --> [*]
  Cancelled --> [*]
```

## 4.9 Component diagram

```mermaid
flowchart LR
  subgraph Frontend
    Pages[App Router pages]
    Components[View components]
    Features[features: scanner, recommender, cart, auth, mannequin]
    API[lib/api client]
  end
  subgraph Backend
    URLs[URL routers]
    Views[Thin APIViews]
    Services[Services]
    Selectors[Selectors]
    Engines[Pure engines]
    Serializers[DRF serializers]
    Commands[Management commands]
  end
  Pages --> Components
  Components --> Features
  Features --> API
  API --> URLs
  URLs --> Views
  Views --> Services
  Views --> Selectors
  Services --> Selectors
  Services --> Engines
  Views --> Serializers
  Commands --> Services
  Commands --> Engines
```

## 4.10 Deployment diagram

```mermaid
flowchart TB
  subgraph Laptop[Local laptop]
    Browser[Chrome / Edge]
    Next[Next.js server :3000]
    Django[Django :8000]
    Docker[Docker Desktop]
    DB[(PostgreSQL 17 + pgvector :5433)]
    Mail[(Mailpit :1025/:8025)]
    Media[(Shared media folder)]
    Models[(ml_models folder)]
  end
  Browser -->|HTTP localhost:3000| Next
  Next -->|rewrite /api,/media| Django
  Django --> DB
  Django --> Mail
  Django --> Media
  Django --> Models
  Docker --> DB
  Docker --> Mail
```

No cloud, HTTPS or public DNS is configured. The demo is intentionally local.

## 4.11 Data-flow diagrams

### Level 0 (context)

```mermaid
flowchart LR
  Shopper -->|photo, tone, cart, orders| WR[Wear Right]
  Staff -->|catalogue, rules, status| WR
  WR -->|tone, picks, outfits, order status| Shopper
  WR -->|records, reports| Staff
```

### Level 1

```mermaid
flowchart TB
  S[Shopper] --> P1[Capture / choose tone]
  P1 --> P2[Analyse skin and section]
  P2 --> P3[Tone palette and picks]
  P3 --> P4[Complete outfit / mannequin]
  P4 --> P5[Cart and checkout]
  P5 --> D1[(Orders)]
  P2 --> D2[(Scan records)]
  P3 --> D3[(Catalogue)]
  Staff --> P6[Maintain catalogue and rules]
  P6 --> D3
  Staff --> P7[Manage orders]
  P7 --> D1
```

### Level 2 — scan detail

```mermaid
flowchart LR
  Photo[Photo / frames] --> Q[Quality gate]
  Q -->|fail| R[Retake reason]
  Q -->|pass| L[Face landmarks]
  L --> T[Skin regions → Lab → ITA/hue/Monk]
  L --> G[Face crop → ONNX gender]
  T --> C[Consensus]
  G --> C
  C --> Result[Tone + section + confidence]
  Result --> Store[(SavedScan / FaceScanRecord)]
```

## 4.12 Design decisions and trade-offs

| Decision | Why | Trade-off |
| --- | --- | --- |
| Pure Python engines | Fast unit tests, no DB needed. | Adapter must translate Django Products. |
| Next rewrite proxy | Same-origin cookies, no CORS. | Next must be running for `/api`. |
| Local storage for scan | Result survives reload without an account. | Per-browser, not synced. |
| Appearance-based gender suggestion | Avoids forcing every shopper to answer. | Binary, imperfect; always overridable. |
| Product `kind` separate from `slot` | Caps/glasses live in accessory but need their own group. | Some imported rows are mis-tagged; guarded by name. |
| Shared external media | Keeps 1.4 GB of photos out of git. | Setup must configure `MEDIA_ROOT`. |
| Short groups, not invented products | Honest catalogue behaviour. | Some groups may show fewer than two items. |
