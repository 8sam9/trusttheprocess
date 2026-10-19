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
