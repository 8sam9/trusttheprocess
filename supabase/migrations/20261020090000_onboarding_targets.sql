-- Spec 001: onboarding and daily targets (ADR 0004, ADR 0005).
-- Adds the four-way goal, starting weight and effective-dated targets, and moves every body-stat write
-- behind SECURITY DEFINER RPCs (apply_targets, reset_onboarding_for_underage).
--
-- PRE-LAUNCH ONLY: step 3 clears onboarding_completed_at on all existing profiles and step 2 narrows
-- column grants. A human must confirm before this runs against any shared or remote database.
--
-- Export / deletion inventory (F15, AC 30). New personal data introduced here:
--   profiles.goal_option, profiles.weight_kg, profiles.weight_recorded_on, and every column of daily_targets.
--   Deletion: daily_targets cascades from auth.users, so the delete-account function needs no change.

-- 1. Four-way goal (Gate 2 resolution 4) and starting weight (OQ 1).
create type public.goal_option as enum ('lose_fat', 'build_muscle', 'fuel_performance', 'just_track');

alter table public.profiles
  add column goal_option public.goal_option,
  add column weight_kg numeric(5, 2) check (weight_kg between 30 and 350),
  add column weight_recorded_on date,
  drop constraint profiles_weekly_rate_kg_check,
  add constraint profiles_weekly_rate_kg_check check (weekly_rate_kg between 0 and 1.5),
  add constraint profiles_goal_option_matches_goal check (
    goal_option is null or goal is null or
    (goal_option = 'lose_fat' and goal = 'lose') or
    (goal_option = 'build_muscle' and goal = 'gain') or
    (goal_option in ('fuel_performance', 'just_track') and goal = 'maintain')
  );

comment on column public.profiles.goal_option is 'Four-way goal chosen in onboarding; goal is derived from it. Export: yes.';
comment on column public.profiles.weight_kg is 'Starting/current weight in kg (2 dp so 0.1 lb round-trips). Spec 007 adopts it as the first weight-log entry. Export: yes.';
comment on column public.profiles.weight_recorded_on is 'User-local date weight_kg was last changed. Export: yes.';

-- 2. Body stats and completion are written only through apply_targets() (ADR 0004).
-- Remaining direct-update columns: display_name, units, timezone.
revoke update (sex, birth_year, height_cm, activity_level, goal, weekly_rate_kg, onboarding_completed_at)
  on table public.profiles from authenticated;

-- 3. Invariant "completed <=> has a targets row". No targets exist yet, so no existing row can be completed.
update public.profiles set onboarding_completed_at = null where onboarding_completed_at is not null;

-- 4. Effective-dated targets. Written only by apply_targets(); never recomputed (AC 23).
create table public.daily_targets (
  user_id uuid not null references auth.users (id) on delete cascade,
  effective_from date not null,
  kcal integer not null check (kcal between 1200 and 12000),
  protein_g integer not null check (protein_g >= 0),
  carbs_g integer not null check (carbs_g >= 0),
  fat_g integer not null check (fat_g >= 0),
  calculated_kcal integer not null check (calculated_kcal between 1200 and 12000),
  is_custom boolean generated always as (kcal <> calculated_kcal) stored,
  floor_applied boolean not null,
  bmr integer not null check (bmr > 0),
  maintenance_kcal integer not null check (maintenance_kcal > 0),
  goal public.goal not null,
  goal_option public.goal_option not null,
  weekly_rate_kg numeric(3, 2) not null check (weekly_rate_kg between 0 and 1.5),
  activity_level public.activity_level not null,
  formula_version text not null check (char_length(formula_version) between 1 and 32),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, effective_from)
);

comment on table public.daily_targets is
  'Daily calorie/macro targets, effective from a user-local date; never recomputed. Health data (GDPR art. 9). Export: all columns (F15).';
comment on column public.daily_targets.effective_from is 'User-local calendar date (YYYY-MM-DD) the targets apply from.';
comment on column public.daily_targets.calculated_kcal is 'Formula result after the safety floor; kcal differs from it only for a manual override.';

create trigger daily_targets_set_updated_at
before update on public.daily_targets
for each row execute function public.set_updated_at();

alter table public.daily_targets enable row level security;

-- Start from zero: read-only for users. No insert/update/delete grants (RPC only).
revoke all on table public.daily_targets from anon, authenticated;
grant select on table public.daily_targets to authenticated;

create policy "daily_targets: read own"
on public.daily_targets for select
to authenticated
using ((select auth.uid()) = user_id);

-- 5. apply_targets: the single atomic write for onboarding and Settings edits.
-- The formula lives in TypeScript (@ttp/shared); this re-checks the safety invariants only. The constants below
-- mirror packages/shared/src/targets.ts and are pinned by the shared fixture (generated pgTAP).
-- Any RAISE rolls back the whole call, including a consent recorded earlier in it.
create function public.apply_targets(
  p_give_consent boolean,
  p_goal_option public.goal_option,
  p_sex public.biological_sex,
  p_birth_year smallint,
  p_height_cm numeric,
  p_weight_kg numeric,
  p_activity_level public.activity_level,
  p_weekly_rate_kg numeric,
  p_units public.unit_system,
  p_timezone text,
  p_kcal integer,
  p_protein_g integer,
  p_carbs_g integer,
  p_fat_g integer,
  p_calculated_kcal integer,
  p_floor_applied boolean,
  p_bmr integer,
  p_maintenance_kcal integer,
  p_formula_version text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_profile public.profiles;
  v_goal public.goal;
  v_age integer;
  v_floor integer;
  v_date date;
  v_targets public.daily_targets;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  -- Row lock serialises double taps.
  select * into v_profile from public.profiles where user_id = v_uid for update;
  if not found then
    raise exception 'not_authenticated';
  end if;

  -- Consent first (ADR 0005): nothing below runs without it.
  if v_profile.health_data_consent_at is null then
    if p_give_consent is not true then
      raise exception 'consent_required';
    end if;
    update public.profiles set health_data_consent_at = now() where user_id = v_uid;
  end if;

  if num_nulls(
    p_goal_option, p_sex, p_birth_year, p_height_cm, p_weight_kg, p_activity_level, p_weekly_rate_kg, p_units,
    p_timezone, p_kcal, p_protein_g, p_carbs_g, p_fat_g, p_calculated_kcal, p_floor_applied, p_bmr,
    p_maintenance_kcal, p_formula_version
  ) > 0 then
    raise exception 'invalid_input';
  end if;

  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then
    raise exception 'invalid_input';
  end if;

  -- Same UTC calendar-year rule as ageInYears() in @ttp/shared.
  v_age := extract(year from now() at time zone 'UTC')::integer - p_birth_year;
  if v_age < 16 then
    raise exception 'under_min_age';
  end if;
  if v_age > 110
    or p_height_cm not between 100 and 250
    or p_weight_kg not between 30 and 350 then
    raise exception 'invalid_input';
  end if;

  v_goal := case p_goal_option
    when 'lose_fat' then 'lose'::public.goal
    when 'build_muscle' then 'gain'::public.goal
    else 'maintain'::public.goal
  end;
  if (v_goal = 'maintain' and p_weekly_rate_kg <> 0)
    or (v_goal <> 'maintain' and p_weekly_rate_kg not between 0.01 and 1.5) then
    raise exception 'invalid_input';
  end if;

  if v_goal = 'lose'
    and (v_age < 18 or p_weight_kg / ((p_height_cm / 100) ^ 2) < 18.5) then
    raise exception 'lose_goal_unavailable';
  end if;

  v_floor := case p_sex when 'male' then 1500 else 1200 end;
  if p_kcal < v_floor or p_calculated_kcal < v_floor then
    raise exception 'below_floor';
  end if;
  if p_floor_applied and p_calculated_kcal <> v_floor then
    raise exception 'invalid_input';
  end if;
  if p_kcal <> p_calculated_kcal and p_kcal > greatest(6000, p_calculated_kcal) then
    raise exception 'above_cap';
  end if;

  if p_protein_g < 0 or p_carbs_g < 0 or p_fat_g < 0
    or abs(4 * p_protein_g + 4 * p_carbs_g + 9 * p_fat_g - p_kcal) > 10
    or 4 * p_protein_g > p_kcal * 0.35 + 2 then
    raise exception 'macro_mismatch';
  end if;

  -- "Applies from today" in the user's own zone (AC 26).
  v_date := (now() at time zone p_timezone)::date;

  update public.profiles set
    sex = p_sex,
    birth_year = p_birth_year,
    height_cm = p_height_cm,
    activity_level = p_activity_level,
    goal = v_goal,
    goal_option = p_goal_option,
    weekly_rate_kg = p_weekly_rate_kg,
    units = p_units,
    timezone = p_timezone,
    weight_recorded_on = case
      when weight_kg is distinct from p_weight_kg then v_date
      else weight_recorded_on
    end,
    weight_kg = p_weight_kg,
    onboarding_completed_at = coalesce(onboarding_completed_at, now())
  where user_id = v_uid
  returning * into v_profile;

  -- Rows dated after the new "today" (the user moved to an earlier timezone) are superseded.
  delete from public.daily_targets where user_id = v_uid and effective_from > v_date;

  insert into public.daily_targets (
    user_id, effective_from, kcal, protein_g, carbs_g, fat_g, calculated_kcal, floor_applied, bmr,
    maintenance_kcal, goal, goal_option, weekly_rate_kg, activity_level, formula_version
  )
  values (
    v_uid, v_date, p_kcal, p_protein_g, p_carbs_g, p_fat_g, p_calculated_kcal, p_floor_applied, p_bmr,
    p_maintenance_kcal, v_goal, p_goal_option, p_weekly_rate_kg, p_activity_level, p_formula_version
  )
  on conflict (user_id, effective_from) do update set
    kcal = excluded.kcal,
    protein_g = excluded.protein_g,
    carbs_g = excluded.carbs_g,
    fat_g = excluded.fat_g,
    calculated_kcal = excluded.calculated_kcal,
    floor_applied = excluded.floor_applied,
    bmr = excluded.bmr,
    maintenance_kcal = excluded.maintenance_kcal,
    goal = excluded.goal,
    goal_option = excluded.goal_option,
    weekly_rate_kg = excluded.weekly_rate_kg,
    activity_level = excluded.activity_level,
    formula_version = excluded.formula_version
  returning * into v_targets;

  return jsonb_build_object('profile', to_jsonb(v_profile), 'targets', to_jsonb(v_targets));
end;
$$;

revoke execute on function public.apply_targets(
  boolean, public.goal_option, public.biological_sex, smallint, numeric, numeric, public.activity_level,
  numeric, public.unit_system, text, integer, integer, integer, integer, integer, boolean, integer, integer, text
) from public, anon;
grant execute on function public.apply_targets(
  boolean, public.goal_option, public.biological_sex, smallint, numeric, numeric, public.activity_level,
  numeric, public.unit_system, text, integer, integer, integer, integer, integer, boolean, integer, integer, text
) to authenticated;

-- 6. Under-16 path: withdraw consent and clear stored body stats for a user who has not completed onboarding.
-- No-op for completed users and always scoped to the caller.
create function public.reset_onboarding_for_underage()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles set
    health_data_consent_at = null,
    sex = null,
    birth_year = null,
    height_cm = null,
    weight_kg = null,
    weight_recorded_on = null,
    activity_level = null,
    goal = null,
    goal_option = null,
    weekly_rate_kg = null
  where user_id = (select auth.uid()) and onboarding_completed_at is null;
$$;

revoke execute on function public.reset_onboarding_for_underage() from public, anon;
grant execute on function public.reset_onboarding_for_underage() to authenticated;
