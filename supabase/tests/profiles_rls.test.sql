-- pgTAP: profiles table security. Run with `supabase test db`.
begin;
select plan(24);

-- Fixtures: two users (the trigger creates their profiles).
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.com');

select has_table('public', 'profiles', 'profiles table exists');
select is(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  true, 'RLS is enabled on profiles'
);
select is((select count(*) from public.profiles)::int, 2, 'signup trigger created a profile per user');

-- Act as Alice.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select is((select count(*) from public.profiles)::int, 1, 'Alice sees exactly one profile');
select is(
  (select user_id from public.profiles), '11111111-1111-1111-1111-111111111111'::uuid,
  'and it is her own'
);

update public.profiles set display_name = 'Alice' where user_id = '11111111-1111-1111-1111-111111111111';
select is(
  (select display_name from public.profiles where user_id = '11111111-1111-1111-1111-111111111111'),
  'Alice', 'Alice can update her own profile'
);

update public.profiles set display_name = 'Hacked' where user_id = '22222222-2222-2222-2222-222222222222';
select throws_ok(
  $$ update public.profiles set user_id = '22222222-2222-2222-2222-222222222222'
     where user_id = '11111111-1111-1111-1111-111111111111' $$,
  '42501', null, 'Alice cannot change user_id'
);
select throws_ok(
  $$ update public.profiles set health_data_consent_at = now() $$,
  '42501', null, 'consent timestamp is not writable directly (set via a dedicated consent flow)'
);
select throws_ok(
  $$ update public.profiles set sex = 'female' $$, '42501', null, 'sex is not directly writable'
);
select throws_ok(
  $$ update public.profiles set birth_year = 1990 $$, '42501', null, 'birth_year is not directly writable'
);
select throws_ok(
  $$ update public.profiles set height_cm = 170 $$, '42501', null, 'height_cm is not directly writable'
);
select throws_ok(
  $$ update public.profiles set activity_level = 'light' $$, '42501', null, 'activity_level is not directly writable'
);
select throws_ok(
  $$ update public.profiles set goal = 'lose', weekly_rate_kg = 0.5 $$, '42501', null,
  'goal and weekly_rate_kg are not directly writable'
);
select throws_ok(
  $$ update public.profiles set onboarding_completed_at = now() $$, '42501', null,
  'onboarding_completed_at is not directly writable (completion only via apply_targets)'
);
select throws_ok(
  $$ update public.profiles set weight_kg = 70 $$, '42501', null, 'weight_kg is not directly writable'
);
select lives_ok(
  $$ update public.profiles set units = 'imperial', timezone = 'Europe/Rome', display_name = 'Alice B' $$,
  'units, timezone and display_name remain directly writable'
);
select isnt(public.give_health_data_consent(), null, 'Alice can give consent via the function');
select is(
  (select count(*) from public.profiles where health_data_consent_at is not null)::int, 1,
  'consent recorded only on her own profile'
);
select lives_ok($$ select public.withdraw_health_data_consent() $$, 'Alice can withdraw consent');
select throws_ok(
  $$ insert into public.profiles (user_id) values ('33333333-3333-3333-3333-333333333333') $$,
  '42501', null, 'authenticated users cannot insert profiles directly'
);
select throws_ok(
  $$ delete from public.profiles $$,
  '42501', null, 'authenticated users cannot delete profiles directly'
);

-- Anonymous visitors see nothing.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select * from public.profiles $$, '42501', null, 'anon has no access to profiles');

-- Back as superuser: Bob's row was untouched, and deleting the auth user cascades.
reset role;
select is(
  (select display_name from public.profiles where user_id = '22222222-2222-2222-2222-222222222222'),
  null, 'Bob''s profile was not modified by Alice'
);

delete from auth.users where id = '22222222-2222-2222-2222-222222222222';
select is(
  (select count(*) from public.profiles where user_id = '22222222-2222-2222-2222-222222222222')::int,
  0, 'deleting the auth user deletes the profile (account deletion)'
);

select * from finish();
rollback;
