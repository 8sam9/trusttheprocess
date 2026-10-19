# Design system: "Track Day" v1

Status: **Accepted 2026-10-19.** Direction A of three explored (Track Day, Matchday, Pulse). Visual reference: the
*Trust the Process — Visual Directions* design canvas (Track Day rows: 9 screens + system sheet).

Code source of truth: `packages/ui/src/tokens.ts`. Primitives: `apps/mobile/src/components/ui.tsx`.
If this doc and the tokens disagree, the tokens win; then fix this doc.

## Brand
- **Name:** Trust the Process. **Short form / mark:** TTP (display type, volt). Icon label: "TTP".
- **Personality:** energetic, sporty, coach-not-judge. Dark-first, like a stadium at night: volt marks action and progress.
- **Voice:** short, active, numbers first ("1,240 kcal left", "42 g protein to go"). Supportive. Never "cheat", "bad",
  "guilty", "earn your food". No medical claims. Caps + italic only for headlines, big numbers and primary buttons.

## Colour
Dark is the default; light follows the system setting (`useScheme()` returns dark unless the OS explicitly asks for light).

| Token | Dark | Light | Use |
|---|---|---|---|
| background | #0B0D0C | #F5F7F3 | screen |
| surface | #161A17 | #FFFFFF | cards, inputs |
| track / trackEmpty | #262B27 / #2C332E | #E1E5E0 | dividers, empty progress |
| border | #3A423C | #C9CFC8 | outlines |
| text | #F4F7F2 | #0B0D0C | |
| textMuted | #A3ABA5 | #5A635C | secondary text (≥ 4.5:1) |
| accent (volt) | #C8FF2E | #C8FF2E | **fills only**: primary buttons, progress, selected tab |
| onAccent | #0B0D0C | #0B0D0C | text on volt |
| accentText | #C8FF2E | #3F5A00 | accent as text/outline (light theme can't use volt as text) |
| danger | #FF5A5A | #C42B2B | destructive |
| warning | #FFB020 | #FFB020 | AI estimates, things to double-check |

**Data colours** (`dataColors`): protein #F4F7F2 (light theme #0B0D0C), carbs #3DD6F5, fat #FF7A45. They always
appear with a text label; colour is never the only signal.
**Source badges** (`sourceBadge`, PRODUCT_SPEC N5): Verified = volt, Brand = cyan, Community = grey, Estimated = amber;
dark text on all.

## Type
Barlow Condensed (display, numbers) + Barlow (body), loaded with expo-font (`apps/mobile/src/lib/fonts.ts`, only six faces).

| Variant | Font | Size / line | Notes |
|---|---|---|---|
| numberXL | Condensed 800 italic | 76 / 72 | hero numbers (kcal left), brand headline |
| display | Condensed 800 italic | 40 / 42 | screen titles, caps |
| headline | Condensed 800 italic | 30 / 32 | sheet titles, caps |
| title | Condensed 800 | 20 / 24 | section titles, caps |
| number | Condensed 600 | 22 / 26 | inline numbers |
| button | Condensed 800 italic | 22 / 26 | primary button label, caps |
| body / bodyRegular | Barlow 500 / 400 | 16 / 23 | |
| small | Barlow 400 | 14 / 20 | |
| label | Barlow 600 | 12 / 16 | caps, +1.2 tracking (field labels, eyebrow text) |

Dynamic Type is on everywhere; `numberXL` is capped at 1.4× so hero numbers don't overflow.

## Space, shape, touch
- Spacing scale: 4 · 8 · 12 · 16 · 20 · 24 · 32 · 48. Screen gutter 20.
- Radius: badge 4 · chip 8 · input 10 · button 12 · card 14.
- Every touch target ≥ 44 pt. Primary CTA 56 pt tall, pinned at the bottom of task screens.

## Components (v1)
| Component | Where | Notes |
|---|---|---|
| Button | `ui.tsx` | primary (volt fill, condensed caps), secondary (outline), danger (text) |
| TextField | `ui.tsx` | label above (label variant), 52 pt, surface fill |
| Choice | `ui.tsx` | chips as radio group; selected = 2 pt accentText outline |
| LaneBar | `ui.tsx` | 10-segment calorie bar, exposed as a progressbar to screen readers |
| Card, Screen, Text, BrandMark | `ui.tsx` | |
| *Planned for Milestone 1* | | macro bar trio, meal row, segmented tabs (Describe/Search/Scan/Photo), stepper, source badge, bottom tab bar with the skewed volt "+" |

## Patterns (from the canvas)
- **Today:** date label → "TODAY" display → streak badge; calorie card (numberXL kcal left, lane bar, macro trio); meal rows; empty meal row is a dashed button whose action is "Fix my day".
- **Add food:** one sheet, four modes as segmented tabs (Describe, Search, Scan, Photo). AI-parsed items are editable
  rows; estimated ones get an amber outline and a "check this" hint. CTA states the result: "Log 3 items · 662 kcal".
- **Onboarding:** 5-step lane progress at the top; radio cards; the final "game plan" screen shows the maths behind the target.
- **Weight:** trend weight is the headline; daily weigh-ins are faint dots, the trend line is volt.

## Accessibility
WCAG 2.2 AA: text ≥ 4.5:1 (muted text 8.3:1 on dark), UI outlines ≥ 3:1 (which is why light mode uses accentText for
outlines), real roles on every control, labels on icon-only buttons, colour never the only signal.
