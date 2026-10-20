-- pgTAP: apply_targets() behaviour beyond the fixture boundary cases (those are in apply_targets_cases.test.sql).
begin;
select plan(43);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.com');

-- Helper (rolled back with the transaction): valid call (AC 17 example); overridable pieces are arguments.
create function public.t_apply(
  p_consent boolean default false,
  p_tz text default 'Europe/Rome',
  p_kcal integer default 1330,
  p_carbs integer default 129,
  p_weight numeric default 65,
  p_birth_year smallint default 1996,
  p_fv text default 'msj-1'
) returns jsonb language sql as $$
  select public.apply_targets(
    p_give_consent => p_consent, p_goal_option => 'lose_fat', p_sex => 'female', p_birth_year => p_birth_year,
    p_height_cm => 165, p_weight_kg => p_weight, p_activity_level => 'light', p_weekly_rate_kg => 0.5,
    p_units => 'metric', p_timezone => p_tz, p_kcal => p_kcal, p_protein_g => 104, p_carbs_g => p_carbs,
    p_fat_g => 44, p_calculated_kcal => 1330, p_floor_applied => false, p_bmr => 1370,
    p_maintenance_kcal => 1884, p_formula_version => p_fv)
$$;

-- 1. Anonymous callers and unauthenticated sessions.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select public.t_apply(true) $$, '42501', null, 'anon cannot execute apply_targets');
select throws_ok($$ select public.reset_onboarding_for_underage() $$, '42501', null, 'anon cannot execute the reset');

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok($$ select public.t_apply(true) $$, 'P0001', 'not_authenticated', 'no auth.uid() is rejected');

-- 2. Consent (ADR 0005), as Alice.
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select throws_ok($$ select public.t_apply(false) $$, 'P0001', 'consent_required', 'consent missing and not given is rejected');
select is(
  (select sex is null and weight_kg is null and onboarding_completed_at is null from public.profiles),
  true, 'consent_required writes nothing'
);
select is((select count(*) from public.daily_targets)::int, 0, 'consent_required creates no targets row');

-- Invalid call with consent given in the same call: whole call rolls back, consent included.
select throws_ok(
  $$ select public.t_apply(true, p_kcal => 1100) $$, 'P0001', 'below_floor', 'invalid call with consent is rejected'
);
select is(
  (select health_data_consent_at from public.profiles), null,
  'rollback: consent given in a failed call is not recorded (atomic)'
);

-- Valid first-run call gives consent and completes onboarding.
select lives_ok($$ select public.t_apply(true) $$, 'valid first-run call with consent succeeds');
select isnt((select health_data_consent_at from public.profiles), null, 'consent recorded by the call');
select isnt((select onboarding_completed_at from public.profiles), null, 'onboarding marked complete');
select is(
  (select goal::text || '/' || goal_option::text || '/' || weekly_rate_kg::text || '/' || weight_kg::text
     from public.profiles),
  'lose/lose_fat/0.50/65.00', 'goal is derived from goal_option; stats stored'
);
select is((select timezone from public.profiles), 'Europe/Rome', 'timezone stored');
select is(
  (select weight_recorded_on from public.profiles), (now() at time zone 'Europe/Rome')::date,
  'weight_recorded_on is the user-local date'
);

-- Return shape.
select is(
  (select array_agg(k order by k) from jsonb_object_keys(public.t_apply(false)) k),
  array['profile', 'targets'], 'returns { profile, targets }'
);
select is(
  (public.t_apply(false) -> 'targets' ->> 'kcal')::int, 1330, 'returned targets carry the stored kcal'
);
select is(
  public.t_apply(false) -> 'profile' ->> 'user_id', '11111111-1111-1111-1111-111111111111',
  'returned profile is the caller''s'
);

-- Existing consent: later calls need no p_give_consent, and a failure keeps consent.
select throws_ok(
  $$ select public.t_apply(false, p_carbs => 200) $$, 'P0001', 'macro_mismatch', 'invalid later call is rejected'
);
select isnt((select health_data_consent_at from public.profiles), null, 'consent preserved after a failed call');

-- 3. Same-day replace; completion timestamp kept; weight date only moves when weight changes.
reset role;
update public.profiles set onboarding_completed_at = '2026-01-01T00:00:00Z', weight_recorded_on = '2026-01-02'
  where user_id = '11111111-1111-1111-1111-111111111111';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select lives_ok($$ select public.t_apply(false, p_kcal => 1400, p_carbs => 147) $$, 'same-day re-apply succeeds');
select is(
  (select count(*) from public.daily_targets where effective_from = (now() at time zone 'Europe/Rome')::date)::int, 1,
  'same-day apply replaces the row instead of adding one'
);
select is((select kcal from public.daily_targets), 1400, 'and holds the latest values');
select is((select is_custom from public.daily_targets), true, 'custom flag follows kcal vs calculated');
select is(
  (select onboarding_completed_at from public.profiles), '2026-01-01T00:00:00Z'::timestamptz,
  'onboarding_completed_at keeps its first value'
);
select is(
  (select weight_recorded_on from public.profiles), '2026-01-02'::date,
  'weight_recorded_on unchanged when the weight is unchanged'
);
select lives_ok($$ select public.t_apply(false, p_weight => 66) $$, 'weight change succeeds');
select is(
  (select weight_recorded_on from public.profiles), (now() at time zone 'Europe/Rome')::date,
  'weight_recorded_on moves to today when the weight changes'
);

-- 4. Timezone decides effective_from. Kiritimati (UTC+14) and Pago Pago (UTC-11) are 25 hours apart, so their
-- local dates always differ whatever the clock says. Past rows stay; an earlier "today" never backdates (L3).
reset role;
delete from public.daily_targets where user_id = '11111111-1111-1111-1111-111111111111';
insert into public.daily_targets (
  user_id, effective_from, kcal, protein_g, carbs_g, fat_g, calculated_kcal, floor_applied, bmr,
  maintenance_kcal, goal, goal_option, weekly_rate_kg, activity_level, formula_version
) values
  ('11111111-1111-1111-1111-111111111111', '2000-01-01', 1500, 100, 180, 50, 1500, false, 1370, 1884,
   'lose', 'lose_fat', 0.5, 'light', 'msj-1');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select lives_ok($$ select public.t_apply(false, 'Pacific/Kiritimati') $$, 'apply in the far-east zone');
select ok(
  exists (select 1 from public.daily_targets where effective_from = (now() at time zone 'Pacific/Kiritimati')::date),
  'effective_from is the local date in Pacific/Kiritimati'
);
select lives_ok($$ select public.t_apply(false, 'Pacific/Pago_Pago') $$, 'apply in the far-west zone');
select lives_ok(
  $$ select public.t_apply(false, 'Pacific/Pago_Pago', p_kcal => 1400, p_carbs => 147) $$,
  'apply in the far-west zone with changed kcal'
);
select is(
  (select array_agg(effective_from order by effective_from) from public.daily_targets),
  array['2000-01-01'::date, (now() at time zone 'Pacific/Kiritimati')::date],
  'moving west: no backdating, the edit replaces the latest row (same-day replace)'
);
select is(
  (select kcal from public.daily_targets where effective_from = (now() at time zone 'Pacific/Kiritimati')::date), 1400,
  'and the latest row holds the new values'
);

-- 4b. L3: a later existing row (2099) wins over an Etc/GMT+12 "today": clamped, replaced in place, nothing earlier changes.
reset role;
insert into public.daily_targets (
  user_id, effective_from, kcal, protein_g, carbs_g, fat_g, calculated_kcal, floor_applied, bmr,
  maintenance_kcal, goal, goal_option, weekly_rate_kg, activity_level, formula_version
) values ('11111111-1111-1111-1111-111111111111', '2099-01-01', 1500, 100, 180, 50, 1500, false, 1370, 1884,
  'lose', 'lose_fat', 0.5, 'light', 'msj-1');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select lives_ok($$ select public.t_apply(false, 'Etc/GMT+12') $$, 'apply in the westernmost zone with a later row present');
select is(
  (select array_agg(effective_from order by effective_from) from public.daily_targets),
  array['2000-01-01'::date, (now() at time zone 'Pacific/Kiritimati')::date, '2099-01-01'::date],
  'later row is neither deleted nor duplicated and no earlier row is added'
);
select is((select kcal from public.daily_targets where effective_from = '2099-01-01'), 1330, 'the 2099 row was replaced');
reset role;
delete from public.daily_targets where user_id = '11111111-1111-1111-1111-111111111111' and effective_from = '2099-01-01';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

-- 4c. L4: text arguments are length-checked inside the function (no constraint errors with row DETAIL).
select throws_ok($$ select public.t_apply(false, p_fv => repeat('x', 33)) $$, 'P0001', 'invalid_input', 'formula_version of 33 chars is invalid_input');
select throws_ok($$ select public.t_apply(false, p_fv => '') $$, 'P0001', 'invalid_input', 'empty formula_version is invalid_input');
select throws_ok($$ select public.t_apply(false, p_tz => repeat('x', 65)) $$, 'P0001', 'invalid_input', 'over-long timezone is invalid_input');
select throws_ok($$ select public.t_apply(false, p_tz => 'Not/AZone') $$, 'P0001', 'invalid_input', 'unknown timezone is invalid_input');

-- 5. Isolation: Bob's call never touches Alice's rows, and a spoofed user id is impossible (no such argument).
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select lives_ok($$ select public.t_apply(true, p_kcal => 1330) $$, 'Bob applies his own targets');
select is(
  (select array_agg(user_id order by user_id) from public.daily_targets),
  array['22222222-2222-2222-2222-222222222222'::uuid],
  'Bob sees only his own targets row (Alice''s are invisible)'
);
reset role;
select is(
  (select count(*) from public.daily_targets where user_id = '11111111-1111-1111-1111-111111111111')::int, 2,
  'Alice''s two targets rows (from the timezone test) are untouched by Bob''s call'
);

select * from finish();
rollback;
