-- pgTAP: daily_targets security. Run with `supabase test db`.
begin;
select plan(14);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.com');

insert into public.daily_targets (
  user_id, effective_from, kcal, protein_g, carbs_g, fat_g, calculated_kcal, floor_applied, bmr,
  maintenance_kcal, goal, goal_option, weekly_rate_kg, activity_level, formula_version
) values
  ('11111111-1111-1111-1111-111111111111', '2026-10-19', 1330, 104, 129, 44, 1330, false, 1370, 1884,
   'lose', 'lose_fat', 0.5, 'light', 'msj-1'),
  ('22222222-2222-2222-2222-222222222222', '2026-10-19', 2000, 150, 200, 60, 2000, false, 1700, 2500,
   'lose', 'lose_fat', 0.5, 'moderate', 'msj-1');

select has_table('public', 'daily_targets', 'daily_targets table exists');
select is(
  (select relrowsecurity from pg_class where oid = 'public.daily_targets'::regclass),
  true, 'RLS is enabled on daily_targets'
);
select is(
  (select is_custom from public.daily_targets where user_id = '11111111-1111-1111-1111-111111111111'),
  false, 'is_custom is generated: false when kcal equals calculated_kcal'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select is((select count(*) from public.daily_targets)::int, 1, 'Alice sees exactly one targets row');
select is(
  (select user_id from public.daily_targets), '11111111-1111-1111-1111-111111111111'::uuid,
  'and it is her own'
);
select is(
  (select count(*) from public.daily_targets where user_id = '22222222-2222-2222-2222-222222222222')::int, 0,
  'Alice cannot read Bob''s targets'
);
select throws_ok(
  $$ insert into public.daily_targets (
       user_id, effective_from, kcal, protein_g, carbs_g, fat_g, calculated_kcal, floor_applied, bmr,
       maintenance_kcal, goal, goal_option, weekly_rate_kg, activity_level, formula_version
     ) values ('11111111-1111-1111-1111-111111111111', '2026-10-20', 1300, 100, 130, 40, 1300, false, 1370, 1884,
       'lose', 'lose_fat', 0.5, 'light', 'msj-1') $$,
  '42501', null, 'authenticated users cannot insert targets directly'
);
select throws_ok(
  $$ update public.daily_targets set kcal = 1500 $$,
  '42501', null, 'authenticated users cannot update targets directly'
);
select throws_ok(
  $$ delete from public.daily_targets $$,
  '42501', null, 'authenticated users cannot delete targets directly'
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select * from public.daily_targets $$, '42501', null, 'anon has no access to targets');

reset role;
select throws_ok(
  $$ insert into public.daily_targets (
       user_id, effective_from, kcal, protein_g, carbs_g, fat_g, calculated_kcal, floor_applied, bmr,
       maintenance_kcal, goal, goal_option, weekly_rate_kg, activity_level, formula_version
     ) values ('11111111-1111-1111-1111-111111111111', '2026-10-21', 1100, 100, 100, 40, 1100, false, 1370, 1884,
       'lose', 'lose_fat', 0.5, 'light', 'msj-1') $$,
  '23514', null, 'kcal below 1200 violates the table check'
);

update public.daily_targets set kcal = 1400 where user_id = '11111111-1111-1111-1111-111111111111';
select is(
  (select is_custom from public.daily_targets where user_id = '11111111-1111-1111-1111-111111111111'),
  true, 'is_custom becomes true when kcal differs from calculated_kcal'
);

delete from auth.users where id = '11111111-1111-1111-1111-111111111111';
select is(
  (select count(*) from public.daily_targets where user_id = '11111111-1111-1111-1111-111111111111')::int, 0,
  'deleting the auth user cascades to daily_targets (account deletion)'
);
select is(
  (select count(*) from public.daily_targets where user_id = '22222222-2222-2222-2222-222222222222')::int, 1,
  'and leaves other users'' targets alone'
);

select * from finish();
rollback;
