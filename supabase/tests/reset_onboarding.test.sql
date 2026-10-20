-- pgTAP: reset_onboarding_for_underage().
begin;
select plan(8);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'carol@example.com');

-- Alice: consented, partial body stats, not completed. Bob: same. Carol: completed.
update public.profiles set
  health_data_consent_at = now(), sex = 'female', birth_year = 2012, height_cm = 150, weight_kg = 45,
  weight_recorded_on = '2026-10-20', activity_level = 'light', goal = 'maintain', goal_option = 'just_track',
  weekly_rate_kg = 0, display_name = 'Name', units = 'imperial', timezone = 'Europe/Rome'
where user_id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
update public.profiles set
  health_data_consent_at = now(), sex = 'male', birth_year = 1990, height_cm = 180, weight_kg = 80,
  activity_level = 'light', goal = 'maintain', goal_option = 'just_track', weekly_rate_kg = 0,
  onboarding_completed_at = now()
where user_id = '33333333-3333-3333-3333-333333333333';

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select public.reset_onboarding_for_underage() $$, '42501', null, 'anon cannot execute');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select lives_ok($$ select public.reset_onboarding_for_underage() $$, 'Alice can reset');
select is(
  (select health_data_consent_at is null and sex is null and birth_year is null and height_cm is null
     and weight_kg is null and weight_recorded_on is null and activity_level is null and goal is null
     and goal_option is null and weekly_rate_kg is null
   from public.profiles),
  true, 'consent and every body-stat column are cleared'
);
select is(
  (select display_name || '/' || units::text || '/' || timezone from public.profiles),
  'Name/imperial/Europe/Rome', 'name, units and timezone are kept'
);

-- Carol (completed) is a no-op.
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
select lives_ok($$ select public.reset_onboarding_for_underage() $$, 'Carol can call it');
select is(
  (select health_data_consent_at is not null and birth_year = 1990 and weight_kg = 80 from public.profiles),
  true, 'no-op for a completed user'
);

-- Bob was never touched by Alice's call.
reset role;
select is(
  (select health_data_consent_at is not null and birth_year = 2012 from public.profiles
    where user_id = '22222222-2222-2222-2222-222222222222'),
  true, 'only the caller''s own row is changed'
);
select is(
  (select count(*) from public.profiles where sex is null and user_id = '11111111-1111-1111-1111-111111111111')::int,
  1, 'Alice''s row is the one that was cleared'
);

select * from finish();
rollback;
