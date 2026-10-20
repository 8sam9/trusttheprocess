# Spec 001: Onboarding and daily targets

Status: **Product section drafted, awaiting Gate 1 (human spec approval).**
Branch: `feat/001-onboarding-targets`. Roadmap: Milestone 1, item 001. Product spec: F1 (N6 adaptive TDEE is a later feature).
Sections below the Product section (Design, Technical plan, QA report, reviews) are filled in by later stages.

---

# Product

## 1. Problem and target user

New users who open TrustTheProcess today land on an empty Today screen and a bare profile form, with no idea how much they should aim to eat. Without a calorie and macro target, the diary (spec 003) has no ring to fill and the app cannot show "kcal left", which is the core of the daily experience. This feature gives every new signed-in user a short first-run onboarding (goal, body stats, activity, pace) that turns their answers into a starting calorie and macro target, shows the maths so the number feels earned and understandable rather than arbitrary, and lets them adjust it later. The target user is an adult or older teen (16+) who wants to track food for fat loss, muscle gain, sport performance, or just awareness, and who may be sensitive about food and weight. The target is presented as an estimate and a starting point, never as a verdict, and it never goes below a safety floor.

## 2. User stories

1. As a new user, I want to answer a few simple questions about my goal and body so that the app gives me a daily calorie and macro target without me having to do the maths.
2. As a new user, I want to see how my target was calculated (maintenance calories and my goal adjustment) so that I trust the number and understand it.
3. As a new user, I want to be asked for explicit consent before the app stores my body data so that I stay in control of my health information.
4. As a user who prefers pounds and feet, I want to enter and see everything in imperial units so that I do not have to convert in my head.
5. As a user who picks a pace that is too aggressive for my stats, I want a plain explanation of why my target was raised to a safe minimum so that I am not confused or pushed toward unsafe eating.
6. As a user whose routine or goal changes, I want to edit my goal, pace, activity or stats later and see the new target before it applies so that my targets stay relevant.
7. As a user who wants a different number, I want to adjust my calorie target manually within safe limits so that the app fits how I actually eat.
8. As a user who is under 16, I want to be told kindly why I cannot use the app yet so that I am not left confused (and the app stores none of my body data).
9. As a user returning on another device, I want my completed onboarding and targets to be there after sign-in so that I do not repeat the setup.
10. As a user who has a history with disordered eating, I want neutral, non-judgemental wording and no pressure to hit extreme numbers so that the app does not harm me.

## 3. Acceptance criteria

Numbering is stable; the QA stage maps each to a test. "Targets" means calorie target plus protein, carbs and fat grams. The calculation itself already exists in `packages/shared` and is reused, not redefined.

### First-run flow and gating
1. **Onboarding is required once.** Given a signed-in user whose `onboarding_completed_at` is empty, when the app opens the signed-in area, then the user sees onboarding instead of Today, and cannot reach Today or the diary until onboarding completes.
2. **Completed users skip it.** Given a signed-in user with `onboarding_completed_at` set, when they open the app (including on a new device or after reinstall), then they land on Today and onboarding is not shown.
3. **Existing partial profiles are prefilled.** Given a signed-in user whose profile already holds some values (for example from the current settings form) but onboarding is not complete, when they enter onboarding, then those values are prefilled and editable.
4. **Goal choices.** Given the goal step, when it is shown, then the user can choose exactly one of: Lose fat, Build muscle, Fuel performance, Just track; and cannot continue without choosing.
5. **Goal mapping.** Given the user picks Lose fat, Build muscle, Fuel performance or Just track, then the stored goal is `lose`, `gain`, `maintain`, `maintain` respectively (see open question 2).
6. **Back navigation keeps answers.** Given the user is on any step after the first, when they go back and forward again, then their earlier answers are still filled in.
7. **Pace step only when relevant.** Given the goal maps to `maintain`, when the user progresses, then no pace is asked and the weekly rate is stored as 0; given the goal is `lose` or `gain`, then a pace choice is required.

### Consent and data minimisation
8. **Consent before body data leaves the device.** Given a user who has not given health-data consent, when they reach the point where body stats are entered, then they are asked for explicit consent first, and no body stat (sex, birth year, height, weight, activity) is sent to the server until the consent is recorded via `give_health_data_consent()`.
9. **Declining consent.** Given the user declines consent, then no body data is stored, onboarding does not complete, and the user is offered only: reconsider, sign out, or delete account. A neutral message explains that the app cannot calculate targets without it.
10. **Consent is withdrawable.** Given a user who consented, when they later withdraw consent in Settings (existing control), then the existing behaviour is unchanged and this feature does not re-ask silently; the next attempt to save body data asks for consent again.
11. **Single atomic save.** Given the user reaches the end of onboarding, when they confirm ("Let's go"), then goal, stats, activity, pace, units, timezone, targets and `onboarding_completed_at` are saved together; if the save fails, none of onboarding is marked complete and the user keeps their answers on screen.

### Minimum age and input validation
12. **Minimum age 16.** Given a birth year that makes the user younger than 16 (using calendar-year difference, as in the shared schema), when they try to continue, then they are blocked with the supportive under-16 message, and no birth year or other body data is stored.
13. **Plausible ranges.** Given inputs outside the shared limits (age above 110, height outside 100 to 250 cm, weight outside 30 to 350 kg), when the user tries to continue, then an inline field-level message explains the accepted range in the user's units, and the user cannot continue.
14. **Imperial entry.** Given the user selected imperial units, when they enter height in feet and inches and weight in pounds, then values are converted to metric for calculation and storage, and every number shown later (weight, height, pace) uses the user's units.
15. **Units default.** Given a first-run user, then units default from the device locale (imperial for US, Liberia, Myanmar; otherwise metric), and the user can switch at any time before finishing.
16. **Minors and low-BMI guard** (recommended default, pending approval; see open question 4). Given the user is 16 or 17, or the entered height and weight give a BMI under 18.5, when they reach the goal or pace choice, then Lose fat is not selectable, a short supportive note explains why and suggests talking to a doctor or dietitian, and the other goals remain available. The BMI value and any weight-status label are never shown.

### Target calculation and reveal
17. **Worked example (calculation).** Given a female, aged 30, 165 cm, 65 kg, lightly active, goal lose at 0.5 kg per week, when targets are computed, then the result is 1,330 kcal, 104 g protein, 129 g carbs, 44 g fat, with maintenance 1,884 kcal and BMR 1,370 kcal. (Uses the existing shared functions; this criterion is a regression guard.)
18. **Macro energy consistency.** Given any valid input, then 4 x protein + 4 x carbs + 9 x fat is within 10 kcal of the calorie target.
19. **Reveal shows the maths.** Given the user reaches the "Your game plan" reveal, then it shows the calorie target, protein, carbs and fat in grams, maintenance calories, and the goal adjustment (surplus, deficit, or none for maintain) such that maintenance plus adjustment equals the target (or the floor, see 20).
20. **Safety floor explained.** Given inputs whose raw target is below the floor (1,200 kcal female or unspecified, 1,500 kcal male; example: female, 40, 155 cm, 50 kg, sedentary, lose 0.75 kg per week), when the reveal is shown, then the target equals the floor, the screen states in plain language that the target was set to a minimum level for safety and that the chosen pace is not possible at that level, and shows the pace actually implied by the floor instead of the chosen one.
21. **Reveal actions.** Given the reveal, when the user taps "Let's go", then the save in AC 11 happens and the user lands on Today; when they tap "Adjust targets", then they can change goal, pace, activity or stats, or edit calories manually (AC 22), and the reveal updates before anything is saved.
22. **Manual calorie adjustment.** Given the user edits the calorie target manually, then the value can not go below the safety floor for their sex setting (an explanatory message is shown if they try), protein is held at the computed value unless it would exceed the 35 percent cap, and fat and carbs are recomputed with the default split; the maths panel marks the target as "custom".
23. **No silent recalculation.** Given a completed user, then stored targets only change when the user confirms a change; the passing of time (for example a new calendar year, which changes age) never alters stored targets by itself.

### Editing later
24. **Entry point in Settings.** Given a completed user, when they open Settings, then a "Daily targets" section shows their current targets and inputs with an Edit action, reusing the same reveal and adjust experience as onboarding.
25. **Preview before apply.** Given a completed user changes goal, pace, activity, units, height, weight, sex or birth year (in Settings), when the change would alter their targets, then they see the new targets and maths and must confirm before they apply; cancel leaves everything unchanged.
26. **Applies from today.** Given a user confirms new targets, then the new targets take effect for the user's current local diary date onward (see open question 5 on past days).
27. **Persistence across devices.** Given a user completes onboarding on device A, when they sign in on device B, then device B shows the same targets without recalculating differently.

### Offline and errors
28. **Offline during steps.** Given the device is offline, when the user moves through the steps and reveal, then everything works (the calculation is local) and the targets are shown; only the consent and final save need a connection.
29. **Offline at save.** Given the device is offline (or the server errors) when the user taps "Let's go" or gives consent, then an inline, non-blocking message says it could not be saved yet, offers Retry, and keeps all answers; nothing is marked complete.
30. **Account deletion and export coverage.** Given a user deletes their account, then all onboarding data and targets are removed with it; and any new stored fields are included in the user's data export once F15 exists (constraint on schema, verified in the technical plan).

### Accessibility and analytics
31. **Accessibility.** Given a screen reader and Dynamic Type at the largest size, then every step is completable: choices are radio groups with labels, the progress indicator is announced ("Step 2 of 5"), errors are announced, and the reveal numbers are readable in a logical order; touch targets are at least 44 pt.
32. **Analytics.** Given the events in section 5, when the corresponding action happens, then exactly one event with only the listed properties is emitted, and no event contains height, weight, birth year, calorie or macro values, name or email.

## 4. Out of scope (explicit)

- Weight log, weight trend chart, weigh-in reminders (spec 007). Onboarding only collects a starting weight (see open question 1).
- Adaptive TDEE and any automatic retargeting from weight and intake (N6, Milestone 2).
- Goal weight, target date or "you will reach X on date Y" projections. No goal-weight field exists in the profile; projections invite fixation and are cut.
- Custom macro percentages or grams per macro, per-meal goals, net-carbs mode (F12, Milestone 2). Only a manual calorie override is included.
- Exercise calories, step goals, Apple Health or Health Connect import (F9, F10).
- Other BMR equations (for example Katch-McArdle, body-fat input).
- Pregnancy, breastfeeding, diabetes, medical conditions or clinical guidance; the copy only recommends speaking with a professional.
- A "no numbers" tracking mode; "Just track" still produces a maintenance target.
- Target history for past days beyond what open question 5 decides; diary ring rendering (spec 003).
- Sign-in method changes, email verification, notification permission prompts, or any marketing or paywall screens.
- Localisation beyond English; unit systems beyond metric and imperial.
- Visual design of screens (the designer's job); this spec only treats the "Track Day" canvas (5-step progress, four goal cards, "Your game plan" reveal with "Let's go" and "Adjust targets") as an input.

## 5. Analytics events

All events carry the standard anonymous user id and platform provided by the analytics layer. They carry no name, email, birth year, height, weight, calorie or macro value, and no free text. Property values are enumerations or small integers.

| Event | Properties | Fires when |
|---|---|---|
| `onboarding_started` | `entry`: `first_run` or `resumed` | First onboarding screen shown |
| `onboarding_step_viewed` | `step`: `goal`, `consent`, `about_you`, `activity`, `pace`, `reveal` | Each step is shown |
| `onboarding_goal_selected` | `goal_option`: `lose_fat`, `build_muscle`, `fuel_performance`, `just_track` | Goal card chosen |
| `health_consent_decided` | `decision`: `given` or `declined`, `surface`: `onboarding` or `settings` | User answers the consent prompt |
| `onboarding_blocked` | `reason`: `under_min_age` or `low_bmi_guard` | Age or BMI guard blocks a choice (no values sent) |
| `targets_revealed` | `goal`: `lose`, `maintain`, `gain`; `floor_applied`: boolean; `units`: `metric` or `imperial`; `source`: `onboarding` or `settings` | Reveal screen shown |
| `targets_adjust_opened` | `source` | "Adjust targets" or Edit tapped |
| `targets_manual_override` | `direction`: `up`, `down`, `blocked_by_floor` | Manual calorie edit committed or rejected (no number sent) |
| `onboarding_completed` | `duration_bucket`: `lt_1m`, `1_to_3m`, `gt_3m`; `back_count`: integer 0 to 5+ | Save succeeded |
| `targets_updated` | `changed`: list of `goal`, `pace`, `activity`, `stats`, `units`, `manual_calories`; `source` | Edited targets confirmed in Settings |
| `onboarding_save_failed` | `reason`: `offline`, `server`, `validation`; `stage`: `consent` or `final_save` | A save attempt fails |

Success measures for this feature: onboarding completion rate (`onboarding_completed` / `onboarding_started`), median time to complete (target under 2 minutes), share of users who open "Adjust targets", share with `floor_applied`, consent decline rate. Analytics must respect the same consent rules as other health-adjacent data; the architect confirms whether goal-level properties need gating behind an analytics opt-in.

## 6. Edge cases

- **Offline:** steps and calculation work offline; consent and the final save need a connection (AC 28, 29). Answers live in memory only and are lost if the app is killed before the save (see open question 6). Full offline-first sync is spec 010, not this one.
- **Empty states:** a user who has not completed onboarding sees no Today, diary or targets; the Settings "Daily targets" section is absent until onboarding is complete. A profile with missing fields (legacy rows) is treated as not onboarded.
- **Errors:** validation errors are inline and specific; server and network errors never lose answers; double taps on "Let's go" must not create duplicate saves; if consent succeeds but the final save fails, the user stays consented and only retries the save.
- **Units:** storage is always metric (kg, cm, kg per week). Imperial pace options are shown in lb per week and converted and rounded to two decimals on save; weights show with sensible precision (0.1 kg or 0.1 lb); height in ft and in must accept 0 to 11 inches; switching units mid-flow converts what is already typed instead of clearing it. Display rounding must not change the stored targets.
- **Age:** age is derived from birth year only, so it can be off by up to one year (roughly 8 kcal per day); accepted. A user who is 15 by exact birthday but 16 by year of birth passes the check; this is a known limitation of year-only collection (open question 3).
- **Timezone and date boundaries:** `timezone` is captured from the device at completion; `onboarding_completed_at` is stored in UTC; "applies from today" uses the user's local `YYYY-MM-DD` at the moment of confirmation, so confirming at 23:59 local applies from that local date. Age year-boundary: targets are not recalculated on 1 January (AC 23). A user who travels across timezones keeps their stored timezone until they re-save their profile.
- **Floor and extremes:** very light or very short users, or a high pace, trigger the floor (AC 20); very high targets (for example tall athletes) are shown as computed with no cap, and the protein cap of 35 percent of calories is already in the shared maths. Carbs never go negative.
- **Goal vs pace:** switching goal from lose or gain to maintain clears the pace; switching from maintain to lose or gain preselects the default pace (recommended: 0.5 kg per week lose, 0.25 kg per week gain).
- **Sex "prefer not to say":** uses the averaged constant already in the shared maths; the floor is 1,200 kcal.
- **Re-entering onboarding:** a user who force-quits mid-onboarding is returned to the start (answers prefilled only from what is already saved). A user who signs out mid-flow and signs in as someone else must not see the previous person's answers.
- **Existing test accounts:** accounts that filled the current settings form but never completed onboarding are routed through onboarding with prefilled values (AC 3).

## 7. Copy guidelines

Voice follows the Track Day brand: short, active, numbers first, coach not judge. Specific rules for this feature:

- Never use: cheat, bad food, good food, clean, junk, guilty, earn, deserve, burn off, "allowed", "budget blown", "off track", "failed", "behind", or any language that treats eating as a reward or a punishment. No before-and-after framing. Do not use weight-status words (underweight, overweight, obese) and never show a BMI number.
- Frame the target as an estimate and a starting point: "This is a starting estimate. Your body is the real guide, and you can change it any time." Avoid "you must", "you should eat".
- Pace labels are neutral and describe speed, not virtue: for example "Steady", "Moderate", "Faster". Do not use "aggressive", "extreme" or "crash".
- The maths panel is plain: "Maintenance 1,884 kcal, minus 550 for your pace, makes 1,334." No exclamation marks around deficits.
- Floor message (suggested): "We set your target to [floor] kcal, a minimum we use for safety. At your stats that means a slower pace than you chose, about [x] per week. If you want to go lower, a doctor or dietitian can help you do it safely."
- Under-16 message (suggested): "TrustTheProcess is for people 16 and over, so we can't set this up for you yet. Thanks for stopping by, and it's fine to come back when you're 16."
- Low-BMI or under-18 note (suggested): "For your age and body, we'll set you up to maintain or build rather than lose. If you have questions about weight or food, a doctor or dietitian is a great person to talk to."
- Consent copy: plain language, says what is stored (body stats, goal, food diary), why, that it is never sold or shown to advertisers, and that it can be withdrawn at any time in Settings. Decline is a visible, equal option, not a faded link.
- "Fuel performance" and "Just track" must feel like first-class goals, not lesser options; "Just track" is described as "Log your food, see your patterns. No weight goal."
- Sex field label stays "used only to estimate your energy needs"; "Prefer not to say" is always available.
- No medical claims: say "estimate", never "optimal", "healthy weight", "recommended by doctors", or "will help you lose X". Include one line in the reveal: "Not medical advice."
- Error copy is calm and specific ("That height looks off. Try between 100 and 250 cm.").
- All copy is final only after the designer and a sensitivity review; this section sets the rules and examples.

## 8. Open questions for the human

Each has a recommended default. If you approve the spec without answers, the defaults stand.

1. **How does onboarding's starting weight relate to the weight log (007)?** Today there is no weight storage, but targets need weight (BMR and protein per kg). Options: (a) a single `current weight` value on the profile now, adopted as the first weight-log entry when 007 lands; (b) pull 007's weight table forward; (c) do not store weight, only use it transiently (rejected: targets could not be recomputed or edited). **Default: (a)**, stored in metric with the date it was recorded. When 007 ships, its migration turns it into the first entry and 007 becomes the source of truth; until then, editing weight in Settings (AC 25) overwrites it. Changing weight later never silently changes targets (AC 23); in 007 or N6 we can prompt "Update your targets?".
2. **What do the four canvas goals map to?** The schema has only lose, maintain, gain. **Default:** Lose fat = lose, Build muscle = gain, Fuel performance = maintain, Just track = maintain; do not persist the four-way choice (no schema change). Consequence: Fuel performance gets no extra carb or protein emphasis in this version. If you want distinct behaviour (for example a higher carb split for Fuel performance), that is a follow-up spec.
3. **Age check precision.** The schema collects birth year only, so 15-year-olds born late in the year can pass. **Default:** keep birth year only (data minimisation) and show an "I am 16 or older" statement in the consent step. Alternative: collect full date of birth (more sensitive data, a schema change).
4. **Protective guards for minors and low BMI (AC 16).** The Mifflin-St Jeor equation is not validated for adolescents, and weight-loss targets for under-18s or low-BMI users carry real risk. **Default:** block Lose fat for ages 16 to 17 and for BMI under 18.5, with a supportive note, never showing BMI. If you consider this too paternalistic or too much for one PR, the fallback is to show a warning only; I do not recommend dropping it entirely.
5. **Do past days keep the target that applied on that day?** If targets are edited and only the current value is stored, past diary rings (spec 003) would silently change. **Default:** yes, store each target with an effective-from local date so 003 can read the target in effect for any date. It is small to add now and costly to retrofit. If the PR is too big, this is the first item to cut and move to spec 003.
6. **Resume mid-onboarding.** **Default:** hold answers in memory and write once at the end (AC 11); no draft saved locally or on the server, which is simpler and keeps health data off the device. The cost is retyping after a force-quit (about 1 minute). Alternative: save drafts after consent.
7. **Declining consent.** **Default:** the user cannot use tracking without consent and sees reconsider, sign out and delete account (AC 9). There is no local-only mode in this version.
8. **Manual override floor (AC 22).** **Default:** users cannot set a calorie target below the floor in the app, with a message pointing to a professional. Alternative: allow it behind a warning. Given the eating-disorder-sensitivity requirement in the product spec, I recommend the hard floor.
9. **Pace options.** **Default:** lose 0.25 / 0.5 / 0.75 kg per week (0.5 / 1 / 1.5 lb), gain 0.25 / 0.5 kg per week (0.5 / 1 lb), default 0.5 and 0.25. The schema allows up to 1 kg per week, but the UI offers less. Please confirm or change the numbers.
10. **Units default from locale (AC 15).** **Default:** imperial for US, Liberia and Myanmar locales, otherwise metric. Confirm, or default everyone to metric.
11. **Analytics gating.** Do goal and `floor_applied` properties need an analytics opt-in under your privacy position? **Default:** treat them as allowed because they are coarse enums with no numbers, and let the security-privacy reviewer confirm.
12. **Is the legal basis text for consent ready?** The consent copy (AC 8) needs your privacy policy wording and a link. **Default:** the architect and designer use placeholder text and a link to a privacy page that you supply before beta.

---
**GATE 1 — approved by Samuele, 2026-10-19 19:59 CEST: "approve as is".** All 32 acceptance criteria in scope; all open questions resolved with the PM's recommended defaults (orchestrator's suggested cuts declined).

---

# Design

Status: **drafted, awaiting Gate 2 (human design approval).** Design system: Track Day v1 (`docs/design/DESIGN_SYSTEM.md`, `packages/ui/src/tokens.ts`, `apps/mobile/src/components/ui.tsx`). Approved canvas inputs: the goal step ("STEP 2 OF 5") and the "Your game plan" reveal (step 5 of 5). Everything else below follows from those two screens. Proposed design-system additions are listed in D7 and are **not** yet in DESIGN_SYSTEM.md.

All example numbers use the AC 17 worked example (female, 30, 165 cm, 65 kg, lightly active, lose 0.5 kg per week → 1,330 kcal, 104 g protein, 129 g carbs, 44 g fat, maintenance 1,884, BMR 1,370). The floor example uses AC 20 (female, 40, 155 cm, 50 kg, sedentary, lose 0.75 kg per week → maintenance 1,329, floor 1,200, implied pace about 0.1 kg per week, 80 g protein, 130 g carbs, 40 g fat).

## D1. User flow

### Step order and why
The canvas fixes **Goal = step 2 of 5** and **Game plan = step 5 of 5**. The order that fits is:

| # | Screen | Progress label | Analytics `step` |
|---|---|---|---|
| — | Consent (only if no consent recorded) | "BEFORE WE START" (no lane bar) | `consent` |
| 1 | About you (units, sex, year of birth, height, weight) | STEP 1 OF 5 | `about_you` |
| 2 | Goal | STEP 2 OF 5 | `goal` |
| 3 | Activity | STEP 3 OF 5 | `activity` |
| 4 | Pace (only lose or gain) | STEP 4 OF 5 | `pace` |
| 5 | Your game plan | STEP 5 OF 5 | `reveal` |

Reasons:
- Consent has to come before body stats are entered (AC 8). It's a gate, not a question, so it isn't counted as a step. Users who have already consented never see it.
- Asking for stats **before** the goal means the age and low-BMI guard (AC 16) is known by the time the goal cards appear. Lose fat can then be shown as unavailable on the goal step itself, instead of being taken away after the user has picked it. It also means an under-16 user is stopped on the first question, before they've done any more work.
- When the goal maps to `maintain`, the pace step is skipped. The lane bar fills segments 4 and 5 together and the reveal still reads "STEP 5 OF 5". Going back from the reveal returns to Activity.

### Happy path (new user, lose fat, metric, units correct from locale, nothing prefilled)
1. App opens in the signed-in area. `onboarding_completed_at` is empty, so onboarding replaces Today (AC 1). No tap.
2. **Consent:** tap "I AGREE". *(tap 1)*
3. **About you:** tap a sex chip *(2)*, tap Year of birth and type 4 digits *(3)*, tap keyboard "Next" and type height *(4)*, tap "Next" and type weight *(5)*, tap "CONTINUE" (pinned above the keyboard) *(6)*.
4. **Goal:** tap a card *(7)*, then "CONTINUE" *(8)*.
5. **Activity:** tap a card *(9)*, then "CONTINUE" *(10)*.
6. **Pace:** the default is preselected (0.5 kg per week for lose, 0.25 kg per week for gain), so tap "CONTINUE" *(11)*.
7. **Your game plan:** tap "LET'S GO" *(12)*. The atomic save runs and the user lands on Today with a success haptic.

**Happy path = 12 taps plus about 9 digit keystrokes** for lose or gain, and **11 taps** for Fuel performance or Just track. For a user who already consented with a prefilled profile (AC 3), it's 6 to 8 taps. Expected time is 45 to 75 seconds, well inside the 2-minute median target.

Taps I considered removing and kept:
- **Auto-advance on goal or activity selection (would save 2 taps). Rejected.** The canvas has a CONTINUE button. The card descriptions need reading time, a mis-tap would cost a back-navigation, and moving focus automatically is a change of context for screen-reader users (WCAG 3.2.2).
- **Auto-advance between number fields when a value is "complete". Rejected** for the same WCAG reason, and weight has no fixed length. Keyboard "Next" plus a CONTINUE pinned above the keyboard means there's never a separate "dismiss keyboard" tap.
- **Consent tap. Kept.** Explicit consent under GDPR needs an affirmative action. The "16 or older" statement (OQ 3) is folded into the same button, so there's no extra checkbox.

### Branches
- **Decline consent:** Consent → "NO THANKS" → Consent declined screen. From there: "Review consent" (back to Consent), "Sign out", or "Delete account" (AC 9).
- **Under 16:** About you → CONTINUE → Not yet screen (AC 12). Nothing is sent.
- **Guard (16 to 17, or BMI under 18.5):** the Goal step shows Lose fat as unavailable, with a note (AC 16).
- **Floor:** the reveal shows the floor state (AC 20).
- **Adjust:** Reveal → "Adjust targets" → Adjust sheet → edit rows or calories → "DONE" → reveal updated (AC 21, 22).
- **Save fails:** an inline notice on the reveal with "Try again". Answers are kept (AC 29).
- **Settings edit:** Settings → Daily targets "Edit" → Edit sheet → change → "APPLY FROM TODAY" (AC 24 to 26). A typical change (activity) takes 5 taps: Edit, Activity row, card, Done, Apply.

## D2. Screens

Shared step layout, top to bottom (all onboarding steps 1 to 5):
- Safe area
- **StepHeader:** a row with `BrandMark` (24) on the left and the label "STEP n OF 5" (`label`, muted) on the right; the 5-segment `LaneBar` below it.
- Back control: native header back (iOS and Android), hidden on step 1 and on Consent.
- Headline (`display`)
- Subline (`bodyRegular`, muted)
- Content
- Scrolling area ends
- **Pinned footer:** primary `Button` (56 pt), optional text button, and the tagline "Trust the process. Show up, log, repeat." (`small`, muted). The tagline is decorative: hidden from screen readers, hidden while the keyboard is open, and hidden at font scale ≥ 1.5.

Gutter 20, vertical gap 16, cards gap 12.

### S0. Signed-in entry (routing gate)
- **Loading:** `background`, centred `BrandMark` (40) with an `ActivityIndicator` (accent) below. Accessibility label "Loading your plan". No copy.
- **Error (profile can't be fetched, so we can't tell whether onboarding is done):** centred `Notice` (danger) reading "We couldn't load your profile. Check your connection and try again.", then primary "TRY AGAIN" and text button "Sign out". Never default to showing onboarding or Today on error; a completed user must not be shown onboarding by mistake.
- **Offline cold start of a completed user:** see the question in D8. The design assumes the cached profile is used and the user lands on Today.

### S1. Consent (`consent`)
Shown only when `health_data_consent_at` is empty: first run, after a withdrawal, or after a previous decline.

Layout, top to bottom:
1. A row with `BrandMark` and the label "BEFORE WE START". No lane bar.
2. Headline: "YOUR DATA, YOUR CALL".
3. Subline: "To set your targets we need some health-related details. Here's the deal, in plain words."
4. A `Card` with four `FactRow`s. Each has a volt-filled 20 pt numbered square ("01" to "04", `number`, onAccent, like the sign-in screen's numbered list), a title (`body`) and a detail (`small`, muted):
   - 01 **What we store** / "Your goal, sex, year of birth, height, weight, activity level and, later, your food diary."
   - 02 **Why** / "To estimate your energy needs and show your daily targets. Nothing else."
   - 03 **Who sees it** / "Never sold. Never shown to advertisers."
   - 04 **Your control** / "Withdraw consent or delete everything any time in Settings."
5. Text link "Read the privacy policy" (`accentText`, underlined, opens the in-app browser, or a new tab on web). Placeholder URL per OQ 12.
6. Statement (`small`, default tone): "By tapping I agree, you confirm you're 16 or older and agree to us storing this health data to calculate your targets."
7. Pinned footer, two **equal-size** buttons stacked: primary "I AGREE" and secondary "NO THANKS". Both 56 pt, full width, both labels in `button` type. Decline is an outlined button of the same size, never a faded link (spec §7). Below them, a text button "Sign out".

States:
- **Default.**
- **Submitting:** "I AGREE" shows a spinner (busy), both buttons are inactive, and a double tap is ignored.
- **Offline or server error:** an inline `Notice` (danger) above the buttons. Offline: "You're offline, so we couldn't record your consent yet. Nothing has been saved." Server: "We couldn't record your consent just now. Nothing has been saved." The primary label becomes "TRY AGAIN". "NO THANKS" stays available. Announced politely.
- **First-time vs returning:** the same screen. Returning after a withdrawal in Settings (AC 10): the subline becomes "You turned off health-data consent. To save body stats or targets again, we need it back."
- **Partial data:** not applicable.

### S1b. Consent declined
1. `BrandMark`.
2. Headline: "YOUR CALL, RESPECTED".
3. Body: "Without your body stats we can't estimate calories and macros, so tracking can't start yet. Nothing about your body has been stored."
4. Body 2 (muted): "Change your mind any time. Or, if you'd rather not keep an account, you can sign out or delete it."
5. Footer: primary "REVIEW CONSENT", secondary "Sign out", text button (danger tone) "Delete account". Delete account uses the existing two-step confirm from Settings ("This permanently deletes your account and all your data. This can't be undone." / "Yes, delete everything" / "Cancel").

States:
- **Returning user who declined earlier and reopens the app:** they land on S1 (consent), not here. Declining is not sticky shame.
- **Delete errors:** the existing copy ("Deletion failed. Please try again.").

### S2. Step 1, About you (`about_you`)
1. StepHeader (1 of 5).
2. Headline: "ABOUT YOU".
3. Subline: "We use these to estimate your energy needs. They stay private to your account."
4. `Choice`, label "Units", options "Metric (kg, cm)" / "Imperial (lb, ft)". Prefilled from the device region (AC 15).
5. `Choice`, label "Sex (used only to estimate your energy needs)", options "Female" / "Male" / "Prefer not to say".
6. `TextField` "Year of birth", number pad, 4 digits, placeholder "1994", `autoComplete` off.
7. Height:
   - Metric: one `TextField` "Height (cm)", number pad, placeholder "170".
   - Imperial: two `TextField`s side by side, "Height (ft)" placeholder "5" and "Height (in)" placeholder "7". The current settings form labels inches "(in)"; it becomes "Height (in)" so the label stands alone for screen readers.
8. Weight: `TextField` "Current weight (kg)" or "Current weight (lb)", decimal pad, placeholder "70" or "155", with helper (`small`, muted) "Just a starting point for your estimate."
9. Footer: "CONTINUE".

Behaviour:
- **Switching units converts** whatever is typed: cm↔ft/in rounded to the nearest inch or cm, kg↔lb to 0.1. Fields are never cleared.
- **Validation** runs on CONTINUE. After the first attempt it also runs on blur. Errors appear inline under each field, focus moves to the first invalid field, and the error is announced. CONTINUE is never disabled, so pressing it always gives feedback.

States:
- **Empty (first run):** placeholders only, units from locale.
- **Partial data / resumed (AC 3):** prefilled values, with a subline addition: "We've filled in what you gave us before. Check it's still right."
- **Validation errors:** see the copy in D4.
- **Under 16:** CONTINUE goes to S2b instead of step 2. Nothing is stored or sent. The in-memory birth year is cleared when S2b opens.
- **Offline:** works normally. No offline banner is needed here.
- **Keyboard open:** the footer CTA rides above the keyboard. The tagline is hidden.

### S2b. Not yet (under 16)
No step header.
1. `BrandMark`.
2. Headline: "SEE YOU AT 16".
3. Body: "TrustTheProcess is for people 16 and over, so we can't set this up for you yet. Thanks for stopping by, and it's fine to come back when you're 16."
4. Body 2 (muted): "We haven't saved your year of birth or any of your answers."
5. Footer: secondary "Sign out", text button "Delete my account", text button "I typed the wrong year" (returns to S2 with the birth-year field emptied and focused). On the last one, see D8.

States: a single state. No analytics values beyond `onboarding_blocked{reason:under_min_age}`.

### S3. Step 2, Goal (`goal`). Approved canvas.
1. StepHeader (2 of 5).
2. Headline: "WHAT ARE YOU TRAINING FOR?"
3. Subline: "We'll set your calories and macros from this. You can change it any time."
4. Four `RadioCard`s in a vertical stack. Each card has a title (`title`, caps) and a description (`small`, muted); the selected card has a 2 pt `accentText` outline and a check icon on the right:
   - LOSE FAT / "Steady deficit, protein kept high"
   - BUILD MUSCLE / "Small surplus, 1.6 g protein per kg". For imperial users: "Small surplus, about 0.7 g protein per lb".
   - FUEL PERFORMANCE / "Eat for your sport, keep weight steady"
   - JUST TRACK / "Log your food, see your patterns. No weight goal." This follows spec §7, which is newer than the canvas line "Maintain and build the habit"; see D8.
5. Footer: "CONTINUE".

States:
- **Nothing selected (first run):** no card preselected. CONTINUE with nothing selected shows the inline message "Pick one to continue." above the footer, announced.
- **Prefilled:** a stored `lose` preselects Lose fat and a stored `gain` preselects Build muscle. A stored `maintain` preselects nothing, because it's ambiguous (see D8).
- **Guard active (AC 16):** a `Notice` (info) sits between the subline and the cards: "For your age and body, we'll set you up to maintain or build rather than lose. If you have questions about weight or food, a doctor or dietitian is a great person to talk to." The Lose fat card is shown unavailable:
   - dashed `border` outline
   - title and description in `textMuted`, not opacity, so the text keeps 4.5:1 contrast
   - a trailing `Tag` reading "NOT AVAILABLE"
   - not focusable as a radio; announced as "Lose fat, unavailable. See note above."

  The card stays in place, so the layout doesn't jump and the guard isn't hidden.
- **Changing goal from lose or gain to maintain** clears the pace. Changing from maintain to lose or gain preselects the default pace (spec §6).
- **Offline:** works normally.

### S4. Step 3, Activity (`activity`)
1. StepHeader (3 of 5).
2. Headline: "HOW ACTIVE IS YOUR WEEK?"
3. Subline: "Count your job and your training together. Pick the closest one."
4. Five `RadioCard`s, using the existing activity labels from settings:
   - MOSTLY SITTING / "Desk-based day, little planned exercise"
   - LIGHTLY ACTIVE / "On your feet some of the day, or 1 to 3 sessions a week"
   - MODERATELY ACTIVE / "3 to 5 sessions a week"
   - VERY ACTIVE / "Hard training 6 to 7 days a week, or a physical job"
   - ATHLETE / "Training twice a day, or a very physical job plus training"
5. Footer: "CONTINUE".

States:
- **Nothing selected:** "Pick the closest one to continue."
- **Prefilled:** the stored level is preselected.
- **Offline:** works normally.

### S5. Step 4, Pace (`pace`). Only for lose or gain.
1. StepHeader (4 of 5).
2. Headline: "PICK YOUR PACE".
3. Subline: "Choose what fits your life. You can change it any time."
4. `RadioCard`s, each with a title, a rate line (`number`) and a description (`small`, muted). The kcal figures are computed live from the user's stats.
   - **Lose, metric:**
     - STEADY / "0.25 kg a week" / "About 275 kcal a day below maintenance"
     - MODERATE (default) / "0.5 kg a week" / "About 550 kcal a day below maintenance"
     - FASTER / "0.75 kg a week" / "About 825 kcal a day below maintenance"
   - **Lose, imperial:** "0.5 lb a week" / about 250; "1 lb a week" / about 500; "1.5 lb a week" / about 750. These are the converted values: 0.23, 0.45 and 0.68 kg.
   - **Gain:** STEADY (default) "0.25 kg a week" / "About 275 kcal a day above maintenance"; MODERATE "0.5 kg a week" / "About 550 kcal a day above maintenance". Imperial: 0.5 and 1 lb.
   - **Floor hint on an option:** when an option's raw target would fall below the floor, a second description line is added, in `small` default tone with no warning colour: "At your stats, this stops at our 1,200 kcal minimum." This tells the user before the reveal instead of surprising them, and it carries no judgement.
5. Footer: "CONTINUE".

States:
- **Default preselected** (spec §6). If a prefilled stored rate matches an option, that option is selected. Otherwise the default is used.
- **Guard active and goal = gain:** works normally. Lose can't reach this step under the guard.
- **Offline:** works normally.

### S6. Step 5, Your game plan (`reveal`). Approved canvas.
1. StepHeader (5 of 5).
2. Eyebrow (`label`, muted), built from goal and pace:
   - lose or gain: "LOSE FAT · MODERATE · 0.5 KG A WEEK"
   - maintain: "FUEL PERFORMANCE · STEADY WEIGHT" or "JUST TRACK · STEADY WEIGHT"
3. Headline: "YOUR GAME PLAN".
4. **Target card** (`Card`):
   - label "DAILY TARGET"
   - `numberXL` in `accentText` ("1,330"), followed by `label` "KCAL A DAY"
   - when custom or floor, a `Tag` right-aligned on the label row: "CUSTOM" or "SAFETY MINIMUM"
   - then the **MacroTrio**: three equal columns, each with a 3 pt top rule in its data colour (protein `dataColors.protein`, carbs cyan, fat orange), a value (`number`, "104 g") and a label (`label`, "PROTEIN" / "CARBS" / "FAT")
5. **Maths card** (`Card`), label "HOW WE GOT HERE", then `BreakdownRow`s with the label on the left, an optional muted sub-line, and the value right-aligned with tabular figures:
   - "Maintenance (BMR × activity)" **1,884**, sub "BMR 1,370 × 1.375, lightly active"
   - lose: "Deficit for your pace" **−550**; gain: "Lean-gain surplus" **+275** (canvas wording); maintain: "Goal adjustment" **0**
   - Divider (`track`), then "Daily target" **1,330**, sub "Rounded to the nearest 10 kcal". The sub is shown only when rounding changed the value; see D8 for AC 19.
6. Note (`bodyRegular`, muted): "This is a starting estimate. Your body is the real guide, and you can change it any time."
7. "Not medical advice." (`small`, muted)
8. Footer: primary "LET'S GO", text button "Adjust targets".

**The canvas note "We recheck it every week against your weight trend." is removed.** Adaptive TDEE (N6) and the weight log (007) are out of scope, so that line would be a false promise. It can come back when N6 ships.

States:
- **Default (computed).**
- **Floor applied (AC 20):**
   - Eyebrow: "LOSE FAT · ABOUT 0.1 KG A WEEK AT THIS TARGET". The implied pace is shown, not the chosen one.
   - The target card shows "1,200" with the `Tag` "SAFETY MINIMUM".
   - A `Notice` (info) between the target card and the maths card: "We set your target to 1,200 kcal, a minimum we use for safety. At your stats that means a slower pace than you chose, about 0.1 kg a week. If you'd like a faster pace, a doctor or dietitian can help you plan it safely."
   - Maths rows: "Maintenance (BMR × activity)" 1,329; "Deficit at the safety minimum" −129; "Daily target" 1,200.
   - **Variant when the floor is at or above maintenance** (implied pace ≤ 0): the Notice reads "We set your target to 1,200 kcal, a minimum we use for safety. At your stats that's about your maintenance level, so we don't expect much weight change at this target. A doctor or dietitian can help you plan a different approach." The adjustment row becomes "Difference from maintenance" +N or 0, and the eyebrow "LOSE FAT · STEADY WEIGHT AT THIS TARGET".
   - Implied pace display: round to 0.1 kg or 0.1 lb. Below 0.05 kg, show "less than 0.1 kg a week".
- **Custom (after a manual edit, AC 22):** the `Tag` "CUSTOM" on the target card, and an extra maths row "Your adjustment" ±N, placed before the total, with the sub "Calculated target was 1,330". The total stays equal to the sum.
- **Saving:** "LET'S GO" shows a spinner with the accessibility label "Saving your plan". The button and "Adjust targets" are inactive, back and swipe-back are disabled, and double taps are ignored (spec §6).
- **Save failed (AC 29):** an inline `Notice` (danger) right above the footer:
   - offline: "You're offline, so we couldn't save your plan yet. Your answers are still here."
   - server: "We couldn't save your plan just now. Your answers are still here."
   - validation: "Something in your answers didn't go through. Check About you and try again."

  The primary label becomes "TRY AGAIN". Nothing is marked complete. If consent succeeded earlier, only the save is retried (spec §6). For validation failures the text button "Review answers" replaces "Adjust targets" and goes to step 1.
- **Offline before tapping:** no pre-emptive banner. The reveal is fully local (AC 28) and errors show only on save.
- **Loading:** none; the calculation is synchronous.
- **First-time vs returning:** the same. In Settings mode the target card and maths are reused inside S10.

### S7. Adjust sheet (onboarding mode). Opened by "Adjust targets".
A bottom `Sheet`, about 90% of the screen height, with a drag handle. On web at 768 px wide or more it's a centred dialog, 480 wide.
1. Header row: title (`headline`) "ADJUST YOUR PLAN" and a close icon button (accessibility label "Close", 44 pt).
2. **Live summary strip:** "1,330 kcal" (`number`) and a compact MacroTrio ("P 104 g · C 129 g · F 44 g", with full labels for screen readers).
3. `ListRow`s, each 56 pt or taller, with a label (`body`), the current value (`small`, muted) and a chevron:
   - "Goal": Lose fat
   - "Pace": Moderate · 0.5 kg a week (the row is hidden for maintain)
   - "Activity": Lightly active
   - "About you": Female · 1996 · 165 cm · 65 kg
4. Section label "DAILY CALORIES", then a `Stepper` (− / value / +) in steps of 50 kcal. The value is tappable to type it directly. Caption: "Calculated: 1,330 kcal" or, when custom, "Custom · calculated was 1,330". When custom, a text button "Use calculated" appears.
5. Helper (`small`, muted): "Protein stays at 104 g. Carbs and fat adjust to match."
6. Footer: primary "DONE".

Tapping a row pushes that step's content (the same RadioCards or the About you form, without the StepHeader) inside the sheet. It has a back chevron "Back" in the header and a primary "DONE" that returns to the list with the summary updated.

States:
- **At the floor:** "−" is disabled. Tapping it, or typing a value below the floor, keeps or snaps the value to the floor and shows `Notice` (info): "1,200 kcal is the lowest target we set in the app. If you'd like to go lower, a doctor or dietitian can help you do it safely." Analytics: `blocked_by_floor`.
- **Protein capped:** when lowering calories triggers the 35% cap, the helper changes to "Protein is capped at 35% of calories at this level, so it's 98 g." (the real value).
- **Inputs changed after a custom edit:** the custom value is cleared and the target recalculates, with an inline note: "Your inputs changed, so we recalculated your target." See D8.
- **Guard becomes active through an About you edit while the goal is lose:** the Goal row shows "Choose a goal" in `danger` text and the AC 16 note. DONE is blocked with "Choose another goal to continue."
- **Validation errors in About you:** inline, same as S2.
- **Offline:** works normally; nothing is saved here.

### S8. Today, first landing (minimal change)
This replaces the placeholder copy that told users to set up their profile. The diary ring remains spec 003.
- Date label, then the display "TODAY" (or "Hi {name}").
- A `Card` with label "TODAY'S TARGET", then `numberXL` "1,330" and `label` "KCAL", the MacroTrio, `LaneBar` value 0 (accessibility label "0 of 1,330 kcal logged"), and muted body "Your plan is set. Food logging lands here next."
- The first time after onboarding only, a one-off inline line (`small`, accent tone, polite announcement): "Plan saved. Let's get going." It disappears on the next app open.
- Settings button: "Profile & settings".

Loading and error states keep the existing copy.

### S9. Settings, reshaped
Top to bottom:
1. "Signed in as …"
2. **DAILY TARGETS** (`title`) inside a `Card`:
   - "1,330" (`headline`) followed by "KCAL A DAY" (`label`)
   - MacroTrio
   - inputs line (`small`, muted): "Lose fat · Moderate, 0.5 kg a week · Lightly active"
   - stats line (`small`, muted): "Female · born 1996 · 165 cm · 65 kg"
   - `Tag`s where they apply: "CUSTOM" or "SAFETY MINIMUM"
   - effective line (`small`, muted): "In effect since 19 Oct 2026"
   - secondary `Button` "Edit targets"
3. **Profile**: "Name (optional)" and Units. Units now save on change, and the name saves on blur; there's no Save button. A "Saved" live text appears after each save.

   Changing units only changes how values are displayed. Targets never change. Stored pace stays in kg, so a 0.5 kg pace displays as "1.1 lb a week".
4. **Privacy** (unchanged).
5. **Account** (unchanged).

Sex, year of birth, height and activity **move out** of the Profile form and into Daily targets, because changing them can change targets and must go through preview (AC 25).

States:
- **Loading:** the existing indicator.
- **Error:** the existing "Couldn't load your profile." plus a "Try again" button.
- **Not onboarded:** the section is absent (spec §6). In practice the gate prevents reaching Settings.
- **Consent withdrawn:** the card still shows the targets, plus a muted line: "Health-data consent is off. If you edit your targets, we'll ask for it again."
- **Maintain goal while the four-way choice isn't stored:** shows "Steady weight" (see D8).

### S10. Edit targets sheet (Settings mode)
The same component as S7, with these differences:
- Title: "EDIT YOUR TARGETS".
- The summary strip shows old → new: "1,330 → 1,420 kcal" and per-macro "104 → 104 g".
- Under the rows, a compact **maths block** (the BreakdownRows from S6) for the new plan. This makes the sheet itself the preview AC 25 requires, which avoids a separate review screen and saves a tap.
- Line (`small`, muted): "Applies from today, Mon 19 Oct. Earlier days keep the targets they had."
- When a custom target exists and inputs change: "This replaces your custom target of 1,500 kcal."
- Footer: primary "APPLY FROM TODAY" (inactive until something would change), secondary "Cancel".

States:
- **No changes:** Apply is inactive, with helper "Change something above to see your new targets."
- **Dirty and dismissed** (swipe down, Close, Cancel or Android back): a confirm dialog "Discard your changes?" with actions "Discard" (destructive) and "Keep editing".
- **Consent missing (AC 10):** "APPLY FROM TODAY" opens S1 as a sheet page in Settings mode (analytics surface `settings`). Agree applies straight away. Declining returns to the edit sheet with the Notice "We need your consent to save body stats. Your targets haven't changed."
- **Applying:** spinner, all controls inactive.
- **Apply failed:** Notice (danger), offline: "You're offline, so your new targets aren't saved yet. Your changes are still here." Server: "We couldn't save your new targets just now. Your changes are still here." The primary becomes "TRY AGAIN".
- **Success:** the sheet closes, a success haptic plays, the card updates, and a live text under the card reads "New targets in effect from today."
- **Floor or guard:** same as S6 and S7.
- **Under 16 via a birth-year edit:** inline field error "You need to be 16 or over to use TrustTheProcess. Check the year." Apply is blocked. The account is not locked; see D8.

## D3. Interactions

**Gestures and navigation**
- Steps use stack pushes. iOS edge swipe-back and Android back both go to the previous step with answers kept (AC 6).
- Back on step 1 or Consent leaves the app (Android) or does nothing (iOS). It never signs the user out.
- After "LET'S GO" succeeds, the stack is replaced with Today, so there's no back into onboarding.
- Sheets dismiss by swiping down (blocked with the discard confirm when dirty).

**Haptics** (expo-haptics; no-op on web; respects the system setting)
- RadioCard or Choice selection: selection tick.
- Stepper change: selection tick. Hitting the floor: one light impact.
- Successful save or apply: success notification.
- No haptic on validation errors. Errors are informative, not alarms.

**Animations** (purposeful only; motion tokens in D7)
- A new lane-bar segment fills over 200 ms when a step advances, so progress is visible.
- The reveal's target and maths cards fade and rise 8 pt over 200 ms, staggered by 60 ms. There's no number count-up, because it delays reading and adds nothing.
- The sheet uses the platform's standard presentation.
- With Reduce Motion on, everything becomes an instant or 100 ms cross-fade.

**Keyboard** (S2 and the Stepper)
- Number pad for year and height (cm, ft, in); decimal pad for weight.
- On iOS a keyboard accessory bar has "Previous", "Next" and "Done". On Android the IME action is "next", and on the last field "done", which submits the step.
- The pinned footer sits above the keyboard, and the scroll keeps the focused field visible.
- On web, Enter submits the step and Tab follows the visual order.

**Undoable**
- Everything before "LET'S GO" can be undone by going back or through Adjust.
- Manual calories can be undone with "Use calculated".
- Settings edits can be cancelled before Apply. After Apply, the user edits again; past days keep their targets (OQ 5), so nothing historical is lost.
- Consent can be withdrawn in Settings.
- Account deletion is the only irreversible action and keeps its existing two-step confirm.

## D4. Copy (verbatim)

Rules applied:
- numbers before judgements
- no "you should" or "must"
- the target is called an estimate
- no BMI number and no weight-status words
- none of the banned words from spec §7

Placeholders are in {braces}; numbers are formatted with thousands separators.

| ID | Where | String |
|---|---|---|
| C-g1 | All steps | "STEP {n} OF 5" (screen reader: "Step {n} of 5") |
| C-g2 | All step footers | "CONTINUE" |
| C-g3 | Step footers (decorative) | "Trust the process. Show up, log, repeat." |
| C-s0a | S0 loading (a11y) | "Loading your plan" |
| C-s0b | S0 error | "We couldn't load your profile. Check your connection and try again." / "TRY AGAIN" / "Sign out" |
| C-c1 | S1 | "BEFORE WE START" |
| C-c2 | S1 | "YOUR DATA, YOUR CALL" |
| C-c3 | S1 | "To set your targets we need some health-related details. Here's the deal, in plain words." |
| C-c4 | S1 | "What we store" / "Your goal, sex, year of birth, height, weight, activity level and, later, your food diary." |
| C-c5 | S1 | "Why" / "To estimate your energy needs and show your daily targets. Nothing else." |
| C-c6 | S1 | "Who sees it" / "Never sold. Never shown to advertisers." |
| C-c7 | S1 | "Your control" / "Withdraw consent or delete everything any time in Settings." |
| C-c8 | S1 | "Read the privacy policy" |
| C-c9 | S1 | "By tapping I agree, you confirm you're 16 or older and agree to us storing this health data to calculate your targets." |
| C-c10 | S1 | "I AGREE" / "NO THANKS" / "Sign out" |
| C-c11 | S1 offline | "You're offline, so we couldn't record your consent yet. Nothing has been saved." |
| C-c12 | S1 server | "We couldn't record your consent just now. Nothing has been saved." |
| C-c13 | S1 after withdrawal | "You turned off health-data consent. To save body stats or targets again, we need it back." |
| C-d1 | S1b | "YOUR CALL, RESPECTED" |
| C-d2 | S1b | "Without your body stats we can't estimate calories and macros, so tracking can't start yet. Nothing about your body has been stored." |
| C-d3 | S1b | "Change your mind any time. Or, if you'd rather not keep an account, you can sign out or delete it." |
| C-d4 | S1b | "REVIEW CONSENT" / "Sign out" / "Delete account" |
| C-a1 | S2 | "ABOUT YOU" |
| C-a2 | S2 | "We use these to estimate your energy needs. They stay private to your account." |
| C-a3 | S2 prefilled | "We've filled in what you gave us before. Check it's still right." |
| C-a4 | S2 labels | "Units" · "Metric (kg, cm)" · "Imperial (lb, ft)" · "Sex (used only to estimate your energy needs)" · "Female" · "Male" · "Prefer not to say" · "Year of birth" · "Height (cm)" · "Height (ft)" · "Height (in)" · "Current weight (kg)" · "Current weight (lb)" |
| C-a5 | S2 helper | "Just a starting point for your estimate." |
| C-e1 | Sex missing | "Choose one to continue. Prefer not to say is fine." |
| C-e2 | Year missing | "Add your year of birth." |
| C-e3 | Year malformed | "Enter a 4-digit year, like 1994." |
| C-e4 | Year too early | "That year looks off. Try {currentYear − 110} or later." |
| C-e5 | Height metric | "That height looks off. Try between 100 and 250 cm." |
| C-e6 | Height imperial | "That height looks off. Try between 3 ft 4 in and 8 ft 2 in." |
| C-e7 | Inches | "Inches go from 0 to 11." |
| C-e8 | Weight metric | "That weight looks off. Try between 30 and 350 kg." |
| C-e9 | Weight imperial | "That weight looks off. Try between 67 and 771 lb." |
| C-e10 | Missing height or weight | "Add your height." / "Add your weight." |
| C-u1 | S2b | "SEE YOU AT 16" |
| C-u2 | S2b | "TrustTheProcess is for people 16 and over, so we can't set this up for you yet. Thanks for stopping by, and it's fine to come back when you're 16." |
| C-u3 | S2b | "We haven't saved your year of birth or any of your answers." |
| C-u4 | S2b | "Sign out" / "Delete my account" / "I typed the wrong year" |
| C-go1 | S3 | "WHAT ARE YOU TRAINING FOR?" |
| C-go2 | S3 | "We'll set your calories and macros from this. You can change it any time." |
| C-go3 | S3 cards | "LOSE FAT" / "Steady deficit, protein kept high" · "BUILD MUSCLE" / "Small surplus, 1.6 g protein per kg" (imperial: "Small surplus, about 0.7 g protein per lb") · "FUEL PERFORMANCE" / "Eat for your sport, keep weight steady" · "JUST TRACK" / "Log your food, see your patterns. No weight goal." |
| C-go4 | S3 none chosen | "Pick one to continue." |
| C-go5 | S3 guard note | "For your age and body, we'll set you up to maintain or build rather than lose. If you have questions about weight or food, a doctor or dietitian is a great person to talk to." |
| C-go6 | S3 guard tag / a11y | "NOT AVAILABLE" / "Lose fat, unavailable. See note above." |
| C-ac1 | S4 | "HOW ACTIVE IS YOUR WEEK?" |
| C-ac2 | S4 | "Count your job and your training together. Pick the closest one." |
| C-ac3 | S4 cards | "MOSTLY SITTING" / "Desk-based day, little planned exercise" · "LIGHTLY ACTIVE" / "On your feet some of the day, or 1 to 3 sessions a week" · "MODERATELY ACTIVE" / "3 to 5 sessions a week" · "VERY ACTIVE" / "Hard training 6 to 7 days a week, or a physical job" · "ATHLETE" / "Training twice a day, or a very physical job plus training" |
| C-ac4 | S4 none chosen | "Pick the closest one to continue." |
| C-p1 | S5 | "PICK YOUR PACE" |
| C-p2 | S5 | "Choose what fits your life. You can change it any time." |
| C-p3 | S5 cards | "STEADY" / "MODERATE" / "FASTER" (lose); "STEADY" / "MODERATE" (gain); rate "{x} kg a week" or "{x} lb a week"; "About {n} kcal a day below maintenance" / "About {n} kcal a day above maintenance" |
| C-p4 | S5 floor hint | "At your stats, this stops at our {floor} kcal minimum." |
| C-r1 | S6 eyebrow | "{GOAL} · {PACE} · {X} KG A WEEK" / "{GOAL} · STEADY WEIGHT" / floor: "{GOAL} · ABOUT {X} KG A WEEK AT THIS TARGET" or "{GOAL} · STEADY WEIGHT AT THIS TARGET" |
| C-r2 | S6 | "YOUR GAME PLAN" |
| C-r3 | S6 card | "DAILY TARGET" · "KCAL A DAY" · "PROTEIN" · "CARBS" · "FAT" · tags "CUSTOM", "SAFETY MINIMUM" |
| C-r4 | S6 maths | "HOW WE GOT HERE" · "Maintenance (BMR × activity)" · "BMR {bmr} × {multiplier}, {activity label lower-case}" · "Deficit for your pace" · "Lean-gain surplus" · "Goal adjustment" · "Deficit at the safety minimum" · "Difference from maintenance" · "Your adjustment" · "Calculated target was {n}" · "Daily target" · "Rounded to the nearest 10 kcal" |
| C-r5 | S6 | "This is a starting estimate. Your body is the real guide, and you can change it any time." |
| C-r6 | S6 | "Not medical advice." |
| C-r7 | S6 | "LET'S GO" / "Adjust targets" / saving a11y "Saving your plan" |
| C-f1 | Floor (pace slowed) | "We set your target to {floor} kcal, a minimum we use for safety. At your stats that means a slower pace than you chose, about {x} a week. If you'd like a faster pace, a doctor or dietitian can help you plan it safely." |
| C-f2 | Floor (≥ maintenance) | "We set your target to {floor} kcal, a minimum we use for safety. At your stats that's about your maintenance level, so we don't expect much weight change at this target. A doctor or dietitian can help you plan a different approach." |
| C-sv1 | Save offline | "You're offline, so we couldn't save your plan yet. Your answers are still here." |
| C-sv2 | Save server | "We couldn't save your plan just now. Your answers are still here." |
| C-sv3 | Save validation | "Something in your answers didn't go through. Check About you and try again." / "Review answers" |
| C-sv4 | Retry | "TRY AGAIN" |
| C-j1 | S7 | "ADJUST YOUR PLAN" · "Goal" · "Pace" · "Activity" · "About you" · "DAILY CALORIES" · "Close" · "Back" · "DONE" |
| C-j2 | S7 | "Calculated: {n} kcal" / "Custom · calculated was {n}" / "Use calculated" |
| C-j3 | S7 | "Protein stays at {p} g. Carbs and fat adjust to match." / capped: "Protein is capped at 35% of calories at this level, so it's {p} g." |
| C-j4 | S7 floor | "{floor} kcal is the lowest target we set in the app. If you'd like to go lower, a doctor or dietitian can help you do it safely." |
| C-j5 | S7 recalculated | "Your inputs changed, so we recalculated your target." |
| C-j6 | S7 guard | "Choose a goal" / "Choose another goal to continue." |
| C-j7 | Stepper a11y | "Daily calories, {n} kcal. Adjustable." / actions "Increase by 50" / "Decrease by 50" |
| C-t1 | S8 | "TODAY'S TARGET" · "KCAL" · "Your plan is set. Food logging lands here next." · "Plan saved. Let's get going." · LaneBar a11y "0 of {n} kcal logged" |
| C-st1 | S9 | "DAILY TARGETS" · "KCAL A DAY" · "In effect since {d MMM yyyy}" · "Edit targets" |
| C-st2 | S9 maintain fallback | "Steady weight" |
| C-st3 | S9 consent off | "Health-data consent is off. If you edit your targets, we'll ask for it again." |
| C-st4 | S9 | "New targets in effect from today." / "Saved" |
| C-ed1 | S10 | "EDIT YOUR TARGETS" · "{old} → {new} kcal" · "APPLY FROM TODAY" · "Cancel" |
| C-ed2 | S10 | "Applies from today, {EEE d MMM}. Earlier days keep the targets they had." |
| C-ed3 | S10 | "Change something above to see your new targets." |
| C-ed4 | S10 | "This replaces your custom target of {n} kcal." |
| C-ed5 | S10 discard | "Discard your changes?" / "Discard" / "Keep editing" |
| C-ed6 | S10 consent declined | "We need your consent to save body stats. Your targets haven't changed." |
| C-ed7 | S10 offline / server | "You're offline, so your new targets aren't saved yet. Your changes are still here." / "We couldn't save your new targets just now. Your changes are still here." |
| C-ed8 | S10 under 16 | "You need to be 16 or over to use TrustTheProcess. Check the year." |

The copy goes to a sensitivity review before it is final (spec §7). The strings to check first are C-go5, C-f1, C-f2, C-j4 and C-u2.

## D5. Accessibility (WCAG 2.2 AA)

**Labels and roles**
- StepHeader is one element with role `progressbar` and value text "Step 2 of 5". The LaneBar `valueText` addition in D7 is required, because the current percentage value would read "40 percent".
- Each RadioCard is role `radio` inside a `radiogroup` labelled by the headline. The label is "Lose fat. Steady deficit, protein kept high." and the state is `checked`, not `selected`; this fix to `Choice` is in D7. Unavailable cards use state `disabled` and point to the guard note.
- Errors are linked to their field (`accessibilityLabel` + error in `accessibilityHint` / `aria-describedby` on web), announced through a polite live region, and focus moves to the first invalid field.
- Save and consent errors are announced politely and focus moves to the Notice.
- Icon-only controls (close, chevrons, stepper ±) have labels.
- The Stepper is `adjustable` with increment and decrement actions.

**Focus and reading order**
- Steps: StepHeader → headline → subline → (guard note) → fields or cards in visual order → error message → CTA → text button. The tagline is hidden from screen readers.
- Reveal: eyebrow → "Your game plan" → "Daily target, 1,330 kcal a day" (one element) → "Protein, 104 grams", "Carbs, 129 grams", "Fat, 44 grams" → floor Notice if present → "How we got here" → each BreakdownRow as one element ("Deficit for your pace, minus 550 kcal"; minus and plus are read as words, not symbols) → note → "Not medical advice" → LET'S GO → Adjust targets.
- When a sheet opens, focus moves to its title. Focus is trapped while it's open and returns to the trigger on close.

**Contrast**
- Body text uses `text` or `textMuted` (≥ 4.5:1 on background and surface in both themes).
- The volt target number uses `accentText` (volt on dark surface; #3F5A00 on white in light mode). It's never raw volt on light.
- Selected outlines use `accentText` (≥ 3:1).
- Macro rules use data colours (non-text, ≥ 3:1), and each is always paired with a word label.
- Unavailable cards use `textMuted` instead of 45% opacity, so their explanation stays readable.
- Tags use `text` on `surface` with a `border` outline.

**Colour is never the only signal**
- Selected cards also show a check icon.
- Errors carry text, not just a red border.
- The floor and custom states have text Tags.
- Macros carry labels.

**Dynamic Type at 200%**
- All text scales; `numberXL` is capped at 1.4× (existing rule).
- At font scale ≥ 1.5, layouts reflow:
  - MacroTrio stacks into three rows (rule on the left, label then value)
  - BreakdownRows put the value under the label
  - the imperial ft/in fields stack
  - the footer unpins and scrolls with the content (only the primary CTA stays pinned while the keyboard is open on S2)
  - the tagline is hidden
- Card titles wrap; nothing truncates.
- Test on iPhone SE width (320 pt) at the AX5 size and Android at 200%.

**Touch targets**
- RadioCards ≥ 64 pt tall, the full width tappable.
- Chips, ListRows, stepper buttons, text buttons and close are all ≥ 44 pt (`minTouch`).
- The primary CTA is 56 pt. The two consent buttons are both 56 pt.

**Other**
- Nothing times out.
- No information is conveyed only by animation.
- The web version meets WCAG 2.2 2.4.11 (focus not obscured): the pinned footer must not cover the focused field. Use scroll padding equal to the footer height.

## D6. Platform notes

**iOS**
- Swipe-back is on between steps and off while saving.
- Keyboard accessory bar for the number pads, which have no return key.
- Sheets use the native page sheet with grabber, and dismissal is blocked when dirty.
- Haptics through expo-haptics.
- Units come from `expo-localization` region (US, LR, MM → imperial).
- Sign in with Apple users may have a relay email; it isn't shown in onboarding.

**Android**
- Hardware back maps to the previous step or sheet page. On step 1 or Consent the app goes to the background.
- IME actions are next and done. The decimal pad must accept the locale decimal separator ("," or ".") and parse both.
- Font scale up to 200% (non-linear scaling on Android 14 and later).
- Edge-to-edge insets.
- Haptics are lighter or absent on some devices, which is fine.

**Web**
- No haptics.
- Content column max 480 px, centred.
- Sheets become modal dialogs at ≥ 768 px (Esc closes, focus trapped).
- RadioCards support arrow-key movement within the group (roving tabindex), and Enter submits a step.
- Number fields use `inputmode="numeric"` / `"decimal"` with `type="text"`, so there's no scroll-wheel value change.
- The privacy link opens in a new tab.
- Browser back maps to the previous step.
- Refreshing loses in-memory answers (OQ 6). A `beforeunload` prompt is shown only after body stats are typed, and only until save.
- Units come from `navigator.language` region.

## D7. Design-system changes (proposed; apply to DESIGN_SYSTEM.md and packages/ui only after Gate 2)

| Change | Type | Justification |
|---|---|---|
| **RadioCard** | new component | Canvas-approved. `Choice` chips can't hold a title plus a description. Props: title, description, extra line, selected, unavailable + tag. 2 pt `accentText` outline and check when selected; dashed `border` and `textMuted` when unavailable. Reused by goal, activity, pace, and later features. |
| **StepHeader** | new component | BrandMark + "STEP n OF 5" + 5-segment LaneBar. Matches the canvas onboarding pattern. |
| **LaneBar `valueText`** | change | Screen readers need "Step 2 of 5", not "40 percent". Optional `valueText` maps to `accessibilityValue.text` and `aria-valuetext`. |
| **Choice accessibility state** | fix | Radios should expose `checked`, not `selected`. This also applies to RadioCard. |
| **TaskScreen** (Screen with pinned footer) | new layout | DESIGN_SYSTEM.md already says the "Primary CTA [is] pinned at the bottom of task screens", but no primitive does it. It handles the keyboard, the safe area, and unpinning at font scale ≥ 1.5. |
| **Button `variant="text"`** and **`size="cta"` for secondary** | change | "Adjust targets", "Use calculated" and "Sign out" need a neutral low-emphasis button (today only `danger` is text-style). Consent "NO THANKS" must be the same size as "I AGREE" (56 pt, `button` type) so declining is an equal option. |
| **MacroTrio** | new (already planned for M1 as the "macro bar trio") | Reveal, Today and Settings. Data-colour top rule + value + label; stacks at large text. Defined now so spec 003 reuses it. |
| **BreakdownRow** | new | The maths panel: label, optional sub-line, right-aligned tabular value, total variant with divider. Numbers use `fontVariant: ['tabular-nums']`. |
| **Notice** | new | Inline message block. Tones: `info` (3 pt `border`-colour left rule, `text`) for floor and guard notes; `danger` for save errors, with an optional action. It deliberately does **not** use `warning` amber, which the DS reserves for AI estimates; reusing it for safety notes would blur that meaning. |
| **Tag** | new | Small outlined label ("CUSTOM", "SAFETY MINIMUM", "NOT AVAILABLE"): `badge` radius, `label` type, `text` on `surface` with `border`. Neutral sibling of the source badges. |
| **Stepper** | new (already planned for M1) | Calories ± 50 with editable value, min and max, adjustable role. Will be reused for servings. |
| **Sheet** | new | Bottom sheet on native, dialog on wide web, with dirty-dismiss confirm. The Add food pattern ("one sheet") will need it too. |
| **ListRow** | new | Label + value + chevron, ≥ 56 pt. Adjust sheet and future Settings. |
| **FactRow** | pattern, not a component | Numbered volt square + title + detail. The same pattern already appears on the sign-in screen; document it in the DS. |
| **Motion tokens** | new tokens | `motion = { fast: 120, base: 200, stagger: 60 }`, plus the rule "Reduce Motion → cross-fade ≤ 100 ms". Keeps animation consistent and reviewable. |
| **`largeTextScale = 1.5`** | new token | One shared breakpoint for reflowing layouts at large Dynamic Type. |

No new colours are proposed.

## D8. Questions and suggested spec changes (for Gate 2)

1. **AC 19 equality vs rounding.** Targets are rounded to the nearest 10, so 1,884 − 550 = 1,334 but the target is 1,330. Proposal: AC 19 reads "equals the target within rounding (±5 kcal)", and the design shows "Rounded to the nearest 10 kcal". The alternative, displaying the adjustment as target − maintenance (−554), misstates the pace.
2. **AC 20 when the floor is at or above maintenance** (small, sedentary users). The "slower pace, about X a week" copy breaks because X ≤ 0. I added variant C-f2. Please add it to AC 20.
3. **Remove the canvas line "We recheck it every week against your weight trend."** It promises N6 and a weight log that aren't in scope.
4. **"Just track" description:** the canvas says "Maintain and build the habit" and spec §7 says "Log your food, see your patterns. No weight goal." I used the spec line. Please confirm.
5. **The four-way goal isn't persisted (OQ 2).** Settings and prefill can't tell Fuel performance from Just track, so the edit sheet would open with neither selected and Settings must say "Steady weight". Recommendation: store a nullable `goal_option` enum (a tiny additive column with no behaviour change). If declined, the fallback above stands.
6. **Custom calories when inputs later change** (spec is silent). The design's default is to recalculate and drop the custom value, saying so (C-j5, C-ed4). Please confirm, or choose "keep custom".
7. **Manual calorie upper bound** (spec is silent). There's no maximum today, so a typo like 13,300 would be accepted. Suggest a cap (for example 6,000 kcal, or 2× maintenance) with "That looks high. Try up to {max} kcal." I haven't added this to the copy table until you decide.
8. **Under-16 "I typed the wrong year".** This lets a genuine typo be fixed but also makes the gate easy to bypass. Also, consent was already recorded on the server for someone who turned out to be under 16; the architect should decide whether hitting the block withdraws that consent automatically. Recommendation: keep the escape and auto-withdraw consent on block.
9. **Offline cold start for completed users.** AC 2 plus the gate need the onboarding status before the network responds. Ask the architect to persist `onboarding_completed_at` (a boolean, not health data) locally so offline users land on Today, not on the S0 error.
10. **Consent recorded on tap vs at final save.** Recording at final save would let the whole flow run offline (AC 28's spirit) and still satisfy AC 8. Recording on tap gives a cleaner consent timestamp. The design records on tap; the architect may choose otherwise without UI changes beyond the error placement.
11. **Settings form reshape.** Body stats move from the Profile form into Daily targets (S9), because AC 25 requires a preview for them. The Profile Save button is replaced by autosave. Flagging it because it changes an existing screen.
12. **Today first landing (S8).** A target card replaces the placeholder "set up your profile" copy. This is minimal and doesn't render the diary ring, which stays in 003, but please confirm it's in scope.

---
## Gate 2 change requests (from Samuele, 2026-10-20)

### CR-1 — Custom pace (step 4, S5; also the Pace row in S7/S10)
- Add a fourth `RadioCard` **CUSTOM** after the presets, label "0.01 to 1.5 kg a week" (imperial: "0.02 to 3.3 lb a week").
  When selected it reveals a decimal input "kg a week" (accessible label "Custom pace in kg a week"), the live line
  "About N kcal a day below maintenance" (above, for gain), and the floor hint when it applies.
- **Allowed range: 0.01–1.5 kg a week** (inclusive). Outside it: inline error "Enter a pace between 0.01 and 1.5 kg a week." and CONTINUE is blocked.
- **Recommendation is always visible:** an info `Notice` between the subline and the options:
  "**We strongly suggest no more than 0.75 kg a week.** Slower is easier to keep up and protects muscle."
- **Above 0.75 kg a week** (custom only): the card outline turns `warning` (amber) and a polite status line appears:
  "Faster than we recommend. We strongly suggest 0.75 kg a week or less. You can still go ahead." No extra confirmation step; the safety calorie floor still applies on top.
- Applies to **lose and gain** with the same range and the same 0.75 recommendation.
- Mockup: design canvas, board "001 · 4 · Pace (with custom)" (interactive).

**Knock-on changes for the architect:**
- `profiles.weekly_rate_kg` check constraint `0..1` → `0..1.5` (new migration; `numeric(3,2)` already fits).
- `@ttp/shared`: `ProfileInput.weeklyRateKg` and `ProfileUpdate.weekly_rate_kg` max `1` → `1.5`; add `RECOMMENDED_MAX_WEEKLY_RATE_KG = 0.75` and `MIN/MAX` constants; tests for 0.01, 0.75, 0.76, 1.5, 1.51.
- Store the custom value as-is (2 decimals); the reveal eyebrow shows "LOSE FAT · CUSTOM · 1.0 KG A WEEK".
- Analytics: `pace_option` gains the value `custom`, plus a coarse `pace_band` enum (`le_0_75` | `gt_0_75`) — no raw numbers.

**New acceptance criteria** (append to §3):
- AC 33 — Given the pace step, when the user selects Custom and enters a value from 0.01 to 1.5 kg a week, then targets compute with that rate; values outside the range show the inline error and CONTINUE is blocked.
- AC 34 — Given a custom value above 0.75 kg a week, then the amber outline and the "Faster than we recommend…" message are shown and announced, and the user can still continue.
- AC 35 — The 0.75 kg recommendation Notice is visible on the pace step whenever it is shown (onboarding and the Pace row of the adjust/edit sheets).

---
**GATE 2 — approved by Samuele, 2026-10-20 08:36 CEST: "approve".** Design section D1–D8 + CR-1 (custom pace), with the orchestrator's resolutions of the designer's D8 items:
1. AC 19: the maths sums within ±5 kcal; show "Rounded to the nearest 10 kcal" when rounding changed the value.
2. AC 20: add the second floor message for floor ≥ maintenance (copy in S6).
3. Remove "We recheck it every week against your weight trend." (no adaptive TDEE yet).
4. Persist the four-way choice: nullable `goal_option` (`lose_fat` | `build_muscle` | `fuel_performance` | `just_track`).
5. Inputs changed after a custom calorie edit: clear the custom value, recalculate, and tell the user ("Your inputs changed, so we recalculated your target.").
6. Manual calorie cap: 6,000 kcal (floor still applies at the bottom).
7. Keep "I typed the wrong year"; when the under-16 block is hit after consent was recorded, withdraw consent automatically.
8. Cache the onboarding-complete flag (and last targets) on device so a completed user opens to Today offline.
9. Consent timing (on tap vs at final save): architect's decision, documented in the technical plan.
10. In scope: Settings reshape (body stats leave the Profile form; units/name autosave) and the Today target card.
Design-system additions in D7 are approved; apply them to DESIGN_SYSTEM.md and packages/ui as part of the build.
