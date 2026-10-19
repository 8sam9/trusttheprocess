# Product Spec — codename **TrustTheProcess**

> A calorie & macro tracker for a global, English-speaking audience. Feature-level inspiration from
> MyFitnessPal (MFP), built clean-room: **no MFP code, assets, API, or database content is used.**
> Competitive input comes only from public marketing pages, app-store listings and press releases.

## 1. Positioning

MFP's biggest user complaints are the things it paywalls or monetises: barcode scanning moved to
Premium (2022), ads in the free tier, and a crowd-sourced database full of duplicates and wrong entries.

**Our wedge:** *"The fastest way to log food — and it's honest."*
1. **Logging speed is the product.** Barcode, photo, voice and free-text logging, all built on one
   AI parsing pipeline. Barcode scan is **free forever**.
2. **Trustworthy data.** Verified sources first (USDA, Open Food Facts), user entries are clearly flagged,
   and duplicates are merged.
3. **No ads, ever.** We earn money from a Pro subscription that pays for the AI features.
4. **You own your data.** Free CSV/JSON export, account deletion in two taps, privacy-first analytics.

## 2. Competitive feature map (MFP public info, Oct 2026)

| Area | MFP Free | MFP Premium ($79.99/yr) | MFP Premium+ ($99.99/yr) |
|---|---|---|---|
| Food diary, 20M+ food DB, calorie goal | ✅ | ✅ | ✅ |
| Water, exercise, steps, weight, community | ✅ | ✅ | ✅ |
| Barcode scan, Meal Scan (photo AI), Voice log | — | ✅ | ✅ |
| Macro targets in grams, per-meal goals, net carbs | — | ✅ | ✅ |
| Intermittent fasting, progress reports, CSV export, ad-free | — | ✅ | ✅ |
| Meal planner, grocery lists, Instacart, dietitian recipes | — | — | ✅ |
| AI nutrition coach, GLP-1 tracking, 40+ integrations, Wear OS | various | | |

## 3. Feature selection

Priority: **P0** = MVP (closed beta), **P1** = public launch v1.0, **P2** = after launch.

### 3.1 Cloned features (table stakes)
| # | Feature | Tier | Priority |
|---|---|---|---|
| F1 | Onboarding: goal (lose/maintain/gain), stats, activity level → calorie + macro targets (Mifflin-St Jeor) | Free | P0 |
| F2 | Food diary by meal (breakfast/lunch/dinner/snacks), daily summary ring | Free | P0 |
| F3 | Food search (USDA + Open Food Facts + own verified foods), serving units | Free | P0 |
| F4 | **Barcode scan** (Open Food Facts lookup, fallback to "create food") | **Free** | P0 |
| F5 | Recent / frequent / favorite foods; copy meal from yesterday | Free | P0 |
| F6 | Custom foods & quick-add calories/macros | Free | P0 |
| F7 | Weight log + trend chart | Free | P0 |
| F8 | Water tracker | Free | P1 |
| F9 | Exercise log (manual + calories burned) | Free | P1 |
| F10 | Apple Health / Health Connect sync (steps, workouts, weight) | Free | P1 |
| F11 | Recipes: build from ingredients, per-serving nutrition | Free | P1 |
| F12 | Macro goals in grams, per-meal goals, net-carbs mode | Free | P1 |
| F13 | Intermittent fasting timer + notifications | Free | P1 |
| F14 | Progress reports (weekly nutrients, adherence) | Pro | P1 |
| F15 | Data export CSV/JSON | **Free** | P1 |
| F16 | Meal planner + grocery list | Pro | P2 |
| F17 | Friends / community feed | Free | P2 (maybe never) |
| F18 | Wearables (Wear OS / watchOS complication) | Free | P2 |

### 3.2 New / differentiating features
| # | Feature | Tier | Priority |
|---|---|---|---|
| N1 | **Natural-language logging**: "2 eggs, toast with butter and a flat white" → parsed entries with confidence + one-tap edit | Free (daily cap) / Pro unlimited | P0 |
| N2 | **Photo logging** (vision LLM) with portion slider + ingredient breakdown | Pro (3 free/day) | P1 |
| N3 | **Voice logging** (speech-to-text → N1 pipeline) | Pro | P1 |
| N4 | **"Fix my day"**: at 6pm, suggests a dinner that closes the remaining macro gap using foods you already log | Pro | P1 |
| N5 | **Data-quality layer**: source badges (Verified / Brand / Community), duplicate merging, report-a-wrong-value | Free | P0 |
| N6 | **Adaptive TDEE**: recalculates your real maintenance calories from weight trend + intake (weekly) | Pro | P1 |
| N7 | **Menu scan**: photo of a restaurant menu → ranked dishes that fit remaining macros | Pro | P2 |
| N8 | **GLP-1 mode**: protein floor, fiber, hydration alerts, symptom journal | Pro | P2 |
| N9 | Offline-first diary (log on a plane, sync later) | Free | P0 (architecture) |
| N10 | Home-screen widgets (remaining kcal / quick log) | Free | P1 |

## 4. MVP scope (P0) — the first measurable target
F1–F7, N1, N5, N9 plus auth (email magic link + Apple/Google sign-in), settings, account deletion.
**Exit criteria:** a user can onboard, log a full day in under 60 seconds using search, barcode or text,
and see an accurate daily summary on iOS, Android and web; there are no P0/P1 bugs; and the security review has passed.

## 5. Data sources (licences matter)
| Source | Use | Licence / note |
|---|---|---|
| USDA FoodData Central (Foundation, SR Legacy, Branded) | Generic + US branded foods | Public domain (CC0) |
| Open Food Facts | Barcodes, global branded foods | ODbL — attribution + share-alike on the derived *database*; keep OFF data in a separate table |
| User-created foods | Long tail | Our ToS grants us a licence; moderation queue |
| LLM estimates | Photo/text when no DB match | Always labelled "estimated" |

**Never:** MFP data, scraped commercial databases.

## 6. Monetisation
- **Free:** everything in §3.1 marked Free, including barcode scanning; N1 capped at 10 parses/day.
- **Pro:** ~$5.99/mo or $39.99/yr (half MFP Premium), 7-day trial. Pays for LLM inference.
- Billing via RevenueCat (App Store, Play, Stripe for web).

## 7. Non-functional requirements
- GDPR/CCPA: consent, export, deletion, DPA with processors; health data is a special category under GDPR → explicit consent.
- Accessibility: WCAG 2.2 AA, Dynamic Type, screen readers.
- Performance: cold start < 2s on mid-range Android; search results < 300 ms p95.
- Not a medical device: no diagnosis claims; minimum calorie floor guardrails (e.g. never suggest < 1200 kcal without warning); eating-disorder–sensitive copy.

## 8. Success metrics
North star: **days logged per weekly active user**. Supporting: D1/D7/D30 retention, time to log a meal,
share of entries made by AI vs search, trial → paid conversion, crash-free sessions ≥ 99.5%.
