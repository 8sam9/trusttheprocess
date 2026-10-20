# ADR 0004 — Effective-dated targets, written only through a validating RPC
Status: Accepted (2026-10-20, spec 001 technical plan; pending Gate 3)

## Context
Spec 001 introduces daily calorie and macro targets. Later features depend on them: the diary ring (003) must show the
target that applied on a past day, weight log (007) and adaptive TDEE (N6) will propose new targets, and export (F15)
and deletion must cover them. The target maths already lives in `@ttp/shared` (`computeDailyTargets`, TypeScript).
The server is Postgres plus Deno edge functions, so we can't run that exact code inside a transaction.

We also need guarantees that hold even for a modified client: health data is only stored with consent, nobody under 16
is stored, targets never go below the safety floor, and a manual target can't exceed the cap. Today the client can
`update profiles` body-stat columns and `onboarding_completed_at` directly, which skips all of these checks.

## Decision
1. **Table `public.daily_targets`**, one row per `(user_id, effective_from)`, where `effective_from` is the
   user-local `YYYY-MM-DD`. A row stores the target **and a snapshot of how it was derived** (BMR, maintenance, goal,
   goal option, pace, activity, calculated vs final kcal, floor flag, `formula_version`). The target for day D is the
   row with the greatest `effective_from <= D`. Same-day edits replace that day's row. Rows are never recomputed.
2. **Clients never write targets or body stats directly.** One `SECURITY DEFINER` function,
   `public.apply_targets(...)`, validates and writes profile inputs, the targets row and `onboarding_completed_at`
   in one transaction. Column-level `UPDATE` on body stats and `onboarding_completed_at` is revoked from
   `authenticated`. Clients may still update `display_name`, `units` and `timezone` directly.
3. **The formula has one implementation (TypeScript in `@ttp/shared`).** The client computes targets for the live
   preview and sends the result. The RPC does **not** re-implement Mifflin-St Jeor. It checks the **safety invariants**,
   which are all constants or simple arithmetic: consent, age 16 to 110, ranges, goal/pace consistency, the lose-goal
   guard (under 18 or BMI under 18.5), the sex-specific floor, the manual cap, and macro energy consistency (±10 kcal).
   The constants exist in TS and in SQL. A shared JSON fixture of boundary cases is checked by vitest against the zod
   contract and by a generated pgTAP file against the RPC. CI fails if the generated file is stale.
4. Body weight is stored on `profiles` (`weight_kg`, `weight_recorded_on`) until spec 007 turns it into the first
   weight-log entry (spec OQ 1).

## Consequences
+ Past days keep their targets (003 needs this). Changing the formula later is safe: old rows keep their snapshot,
  and `formula_version` tells them apart.
+ The safety properties hold server-side even for a tampered client. Consent can no longer be bypassed by a direct
  profile update. This closes a gap left by Milestone 0's column grants.
+ No edge function and no second formula, so no Deno/npm import-map work and no formula drift.
− A tampered client can store a `calculated_kcal` that the formula would not produce. This only affects the user's
  own data, and it is still within the floor, cap and consistency bounds. Accepted.
− Safety constants are duplicated in SQL. Mitigated by the parity fixture plus generated pgTAP.
− Settings can no longer save body stats with a plain `update`. Every target-affecting change goes through
  preview and apply (which is what AC 25 requires anyway).
− Future writers of targets (N6 adaptive TDEE) must go through `apply_targets` or a sibling RPC with the same checks.
