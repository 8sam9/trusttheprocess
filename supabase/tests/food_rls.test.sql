-- pgTAP: food catalogue access boundary (spec 002, AC 39 and 53). Run with `supabase test db`.
-- Clients may read food.foods and nothing else; only food_importer writes; nobody deletes.
begin;
select plan(33);

-- Fixtures as the table owner (bypasses RLS): one release, one run, one USDA and one OFF food.
insert into food.releases (dataset, label, file_sha256)
values ('usda_foundation', 'test-release', repeat('a', 64));
insert into food.import_runs (mode, tool_version) values ('full', 'test');

create function pg_temp.mkfood(p_key text, p_source food.source) returns uuid
language sql as $$
  insert into food.foods (
    id, source, dataset, tier, carbs_basis, release_id, last_run_id, kcal, protein_g, carbs_g, fat_g,
    content_hash, source_ref, name_lang, name
  ) values (
    md5(p_key)::uuid, p_source,
    case p_source when 'usda' then 'usda_foundation'::food.dataset else 'off'::food.dataset end,
    'verified', 'total', (select min(id) from food.releases), (select min(id) from food.import_runs),
    100, 1, 2, 3, 0, p_key, 'en', 'Food ' || p_key
  ) returning id;
$$;
select pg_temp.mkfood('usda-1', 'usda');
select pg_temp.mkfood('off-1', 'off');

-- RLS is enabled on all three tables (AC 39, 53).
select is((select relrowsecurity from pg_class where oid = 'food.foods'::regclass), true, 'RLS enabled on food.foods');
select is((select relrowsecurity from pg_class where oid = 'food.releases'::regclass), true, 'RLS enabled on food.releases');
select is((select relrowsecurity from pg_class where oid = 'food.import_runs'::regclass), true, 'RLS enabled on food.import_runs');
select is(has_schema_privilege('anon', 'food', 'usage'), false, 'anon has no usage on schema food');
select is(has_schema_privilege('authenticated', 'food', 'usage'), true, 'authenticated has usage on schema food (for the RPCs)');

-- Authenticated user (any user: the catalogue holds no user data).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select is((select count(*) from food.foods)::int, 2, 'authenticated reads foods (both sources)');
select throws_ok(
  $$ insert into food.foods (id, source, dataset, tier, carbs_basis, release_id, last_run_id, kcal, protein_g, carbs_g, fat_g, content_hash, source_ref, name_lang, name)
     values (gen_random_uuid(), 'usda', 'usda_foundation', 'verified', 'total', 1, 1, 1, 1, 1, 1, 0, 'x', 'en', 'x') $$,
  '42501', null, 'authenticated cannot insert a usda food');
select throws_ok(
  $$ insert into food.foods (id, source, dataset, tier, carbs_basis, release_id, last_run_id, kcal, protein_g, carbs_g, fat_g, content_hash, source_ref, name_lang, name)
     values (gen_random_uuid(), 'off', 'off', 'community', 'unknown', 1, 1, 1, 1, 1, 1, 0, 'x', 'en', 'x') $$,
  '42501', null, 'authenticated cannot insert an off food');
select throws_ok($$ update food.foods set kcal = 1 where source = 'usda' $$, '42501', null, 'authenticated cannot update a usda food');
select throws_ok($$ update food.foods set kcal = 1 where source = 'off' $$, '42501', null, 'authenticated cannot update an off food');
select throws_ok($$ delete from food.foods where source = 'usda' $$, '42501', null, 'authenticated cannot delete a usda food');
select throws_ok($$ delete from food.foods where source = 'off' $$, '42501', null, 'authenticated cannot delete an off food');
select throws_ok($$ select * from food.import_runs $$, '42501', null, 'authenticated cannot read import_runs (AC 53)');
select throws_ok($$ select * from food.releases $$, '42501', null, 'authenticated cannot read releases');
select throws_ok($$ insert into food.import_runs (mode, tool_version) values ('full', 'x') $$, '42501', null, 'authenticated cannot write import_runs');
select throws_ok($$ insert into food.releases (dataset, label, file_sha256) values ('off', 'x', repeat('b', 64)) $$, '42501', null, 'authenticated cannot write releases');
select throws_ok($$ select food.recompute_canonical(1) $$, '42501', null, 'authenticated cannot run recompute_canonical');

-- Anonymous: nothing at all.
reset role;
set local role anon;
select set_config('request.jwt.claims', '', true);
select throws_ok($$ select * from food.foods $$, '42501', null, 'anon cannot read foods');
select throws_ok($$ select * from food.import_runs $$, '42501', null, 'anon cannot read import_runs');
select throws_ok($$ select * from food.releases $$, '42501', null, 'anon cannot read releases');
select throws_ok($$ update food.foods set kcal = 1 $$, '42501', null, 'anon cannot update foods');
select throws_ok($$ delete from food.foods $$, '42501', null, 'anon cannot delete foods');
select throws_ok($$ select food.recompute_canonical(1) $$, '42501', null, 'anon cannot run recompute_canonical');

-- The importer: insert and update, never delete, no user data.
reset role;
-- pgTAP lives in schema extensions; the importer needs usage only to call the test helpers.
grant usage on schema extensions to food_importer;
set local role food_importer;
select lives_ok(
  $$ insert into food.import_runs (mode, tool_version) values ('partial', 'importer-test') $$,
  'food_importer can insert an import run');
select lives_ok(
  $$ insert into food.releases (dataset, label, file_sha256) values ('off', 'dump-1', repeat('c', 64)) $$,
  'food_importer can insert a release');
select lives_ok(
  $$ insert into food.foods (id, source, dataset, tier, carbs_basis, release_id, last_run_id, kcal, protein_g, carbs_g, fat_g, content_hash, source_ref, name_lang, name)
     values ('99999999-9999-9999-9999-999999999999', 'usda', 'usda_foundation', 'verified', 'total',
             (select min(id) from food.releases), (select min(id) from food.import_runs), 1, 1, 1, 1, 0, 'imp-1', 'en', 'Importer food') $$,
  'food_importer can insert a food');
select lives_ok(
  $$ update food.foods set kcal = 2 where id = '99999999-9999-9999-9999-999999999999' $$,
  'food_importer can update a food');
select is((select kcal from food.foods where id = '99999999-9999-9999-9999-999999999999'), 2::real, 'and the update took effect');
select lives_ok($$ update food.import_runs set status = 'succeeded' where mode = 'partial' $$, 'food_importer can update a run');
select throws_ok($$ delete from food.foods where source = 'usda' $$, '42501', null, 'food_importer cannot delete foods');
select throws_ok($$ select * from public.profiles $$, '42501', null, 'food_importer has no access to user data');
select lives_ok($$ select food.recompute_canonical((select min(id) from food.import_runs)) $$, 'food_importer can run recompute_canonical');
select is((select rolcanlogin from pg_roles where rolname = 'food_importer'), false, 'food_importer is NOLOGIN (a human enables login, H5)');

reset role;
select * from finish();
rollback;
