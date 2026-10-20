-- pgTAP: food read RPCs (spec 002 B2; AC 14, 16, 27, 33, 39, 44, 50). get_foods, lookup_barcode, search_foods.
begin;
select plan(56);

insert into food.releases (dataset, label, file_sha256) values ('usda_branded', 'test', repeat('f', 64));
insert into food.import_runs (mode, tool_version) values ('full', 'test');

create function pg_temp.mk(p_key text, p_source food.source, p_name text, p_barcode text default null,
                           p_canonical boolean default true, p_hidden food.reason_code default null,
                           p_restricted boolean default false, p_brand text default null,
                           p_reasons food.reason_code[] default '{}', p_fibre real default null,
                           p_tier food.tier default 'brand') returns uuid
language sql as $$
  insert into food.foods (
    id, source, dataset, tier, carbs_basis, is_canonical, barcode_restricted, hidden_reason, release_id, last_run_id,
    kcal, protein_g, carbs_g, fat_g, fibre_g, content_hash, source_ref, barcode, name_lang, name, brand, reasons, servings
  ) values (
    md5(p_key)::uuid, p_source,
    case p_source when 'usda' then 'usda_branded'::food.dataset else 'off'::food.dataset end,
    p_tier, 'total', p_canonical, p_restricted, p_hidden,
    (select min(id) from food.releases), (select min(id) from food.import_runs),
    100, 1, 2, 3, p_fibre, 0, p_key, p_barcode, 'en', p_name, p_brand, p_reasons,
    '[{"label":"1 cup","grams":240}]'
  ) returning id;
$$;

-- Fixtures (as owner).
select pg_temp.mk('banana', 'usda', 'Banana, raw', '05000000200001', true, null, false, null, '{energy_from_kj,superseded}', 0, 'verified');
select pg_temp.mk('oats', 'usda', 'Oats, rolled', '05000000200002', true, null, false, 'Mill & Co', '{}', null);
select pg_temp.mk('pct', 'usda', '100% juice');
select pg_temp.mk('hidden', 'usda', 'Hiddenfood', '05000000200003', true, 'removed_upstream');
select pg_temp.mk('noncanon', 'usda', 'Noncanonfood', '05000000200004', false);
select pg_temp.mk('restricted', 'usda', 'Restrictedfood', '02000000000015', true, null, true);
-- Cluster 5: OFF is canonical (higher tier), USDA is the other member.
select pg_temp.mk('c5-off', 'off', 'Clusterfood off', '05000000200005', true, null, false, null, '{}', null, 'verified');
select pg_temp.mk('c5-usda', 'usda', 'Clusterfood usda', '05000000200005', false);
-- Cluster 6: OFF only.
select pg_temp.mk('c6-off', 'off', 'Offonlyfood', '05000000200006');
-- 60 rows for the limit cap.
select pg_temp.mk('lim' || i, 'usda', 'Zzlimit ' || i) from generate_series(1, 60) i;

-- Roles and grants.
select is(has_function_privilege('anon', 'public.get_foods(uuid[], boolean)', 'execute'), false, 'anon cannot execute get_foods');
select is(has_function_privilege('anon', 'public.lookup_barcode(text, boolean)', 'execute'), false, 'anon cannot execute lookup_barcode');
select is(has_function_privilege('anon', 'public.search_foods(text, integer, boolean)', 'execute'), false, 'anon cannot execute search_foods');
select is(has_function_privilege('authenticated', 'public.get_foods(uuid[], boolean)', 'execute'), true, 'authenticated can execute get_foods');
select is((select count(*)::int from pg_proc where proname in ('get_foods', 'lookup_barcode', 'search_foods') and (prosecdef or provolatile <> 's')), 0,
  'all three RPCs are SECURITY INVOKER and stable');

set local role anon;
select throws_ok($$ select * from public.get_foods(array[gen_random_uuid()]) $$, '42501', null, 'anon call to get_foods is refused');
select throws_ok($$ select * from public.lookup_barcode('05000000200001') $$, '42501', null, 'anon call to lookup_barcode is refused');
select throws_ok($$ select * from public.search_foods('banana') $$, '42501', null, 'anon call to search_foods is refused');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

-- get_foods
select is((select count(*)::int from public.get_foods(array[md5('hidden')::uuid])), 1, 'get_foods returns a hidden row by id (AC 33)');
select is((select hidden from public.get_foods(array[md5('hidden')::uuid])), true, 'and marks it hidden');
select is((select hidden from public.get_foods(array[md5('banana')::uuid])), false, 'a visible row is not hidden');
select is((select count(*)::int from public.get_foods(array[md5('noncanon')::uuid])), 1, 'get_foods returns a non-canonical row by id (AC 27)');
select is((select is_canonical from public.get_foods(array[md5('noncanon')::uuid])), false, 'and reports is_canonical = false');
select is(
  (select array_agg(source_ref) from public.get_foods(array[md5('oats')::uuid, md5('banana')::uuid, md5('pct')::uuid])),
  array['oats', 'banana', 'pct'], 'rows come back in the order of the requested ids');
select is((select count(*)::int from public.get_foods(array[gen_random_uuid()])), 0, 'unknown ids return nothing');
select is((select count(*)::int from public.get_foods('{}'::uuid[])), 0, 'an empty id list returns nothing');
select is(
  (select array_agg(k order by k) from (select jsonb_object_keys(to_jsonb(g)) k from public.get_foods(array[md5('banana')::uuid]) g) s),
  array['alt_names','barcode','brand','carbs_basis','carbs_g','dataset','fat_g','fibre_g','hidden','id','is_canonical','kcal','name','name_lang',
        'protein_g','reasons','satfat_g','servings','sodium_mg','source','source_ref','sugars_g','tier','updated_at'],
  'get_foods returns exactly the FoodRow columns, no internal ones');
select is((select reasons from public.get_foods(array[md5('banana')::uuid])), array['energy_from_kj']::food.reason_code[],
  'reasons holds soft flags only (hide reasons are filtered out)');
select is((select fibre_g from public.get_foods(array[md5('banana')::uuid])), 0::real, 'a known zero stays 0');
select is((select fibre_g is null from public.get_foods(array[md5('oats')::uuid])), true, 'an unknown value stays null');
select is((select servings from public.get_foods(array[md5('banana')::uuid])), '[{"label":"1 cup","grams":240}]'::jsonb, 'servings are returned inline');
select throws_ok($$ select * from public.get_foods((select array_agg(gen_random_uuid()) from generate_series(1, 201))) $$,
  'P0001', 'too_many_ids', '201 ids raise too_many_ids');
select lives_ok($$ select * from public.get_foods((select array_agg(gen_random_uuid()) from generate_series(1, 200))) $$, '200 ids are fine');
select throws_ok($$ select * from public.get_foods(null) $$, 'P0001', 'invalid_input', 'null ids raise invalid_input');
select is((select count(*)::int from public.get_foods(array[md5('c6-off')::uuid])), 0, 'OFF rows are excluded by default (AC 44)');
select is((select count(*)::int from public.get_foods(array[md5('c6-off')::uuid], true)), 1, 'and returned with p_include_off = true');

-- lookup_barcode
select is((select source_ref from public.lookup_barcode('05000000200001')), 'banana', 'lookup finds the visible canonical row by GTIN-14');
select is((select count(*)::int from public.lookup_barcode('05000000200004')), 0, 'a non-canonical row is not returned (AC 27)');
select is((select count(*)::int from public.lookup_barcode('05000000200003')), 0, 'a hidden row is not returned');
select is((select count(*)::int from public.lookup_barcode('05000000299999')), 0, 'an unknown barcode returns an empty set');
select is((select count(*)::int from public.lookup_barcode('02000000000015')), 0, 'a restricted code is never resolved (AC 16)');
select is((select count(*)::int from public.lookup_barcode('02000000000015', true)), 0, 'not even with OFF included');
select is((select source_ref from public.lookup_barcode('05000000200005')), 'c5-usda', 'OFF excluded: the USDA member is returned when OFF is canonical (T8)');
select is((select source_ref from public.lookup_barcode('05000000200005', true)), 'c5-off', 'OFF included: the canonical member is returned');
select is((select count(*)::int from public.lookup_barcode('05000000200006')), 0, 'OFF-only barcode returns nothing by default');
select is((select count(*)::int from public.lookup_barcode('05000000200006', true)), 1, 'and one row with p_include_off = true');
select throws_ok($$ select * from public.lookup_barcode('0036000291452') $$, 'P0001', 'invalid_input', '13 digits raise invalid_input');
select throws_ok($$ select * from public.lookup_barcode('0500000020000a') $$, 'P0001', 'invalid_input', 'non-numeric raises invalid_input');
select throws_ok($$ select * from public.lookup_barcode(null) $$, 'P0001', 'invalid_input', 'null raises invalid_input');

-- search_foods
select is((select count(*)::int from public.search_foods('anan') where source_ref = 'banana'), 1, 'search finds a row by partial name (AC 50)');
select is((select count(*)::int from public.search_foods('BANANA') where source_ref = 'banana'), 1, 'search is case-insensitive');
select is((select count(*)::int from public.search_foods('mill') where source_ref = 'oats'), 1, 'search matches the brand too');
select is((select count(*)::int from public.search_foods('bananna') where source_ref = 'banana'), 1, 'search tolerates a typo (trigram similarity)');
select is((select count(*)::int from public.search_foods('100%')), 1, 'LIKE wildcards in the query are literal');
select is((select count(*)::int from public.search_foods('%') where source_ref <> 'pct'), 0, 'a bare % does not match everything');
select is((select count(*)::int from public.search_foods('Hiddenfood') where source_ref = 'hidden'), 0, 'hidden rows are not searchable');
select is((select count(*)::int from public.search_foods('Noncanonfood')), 0, 'non-canonical rows are not searchable (AC 27)');
select is((select count(*)::int from public.search_foods('Offonlyfood')), 0, 'OFF rows are excluded by default');
select is((select count(*)::int from public.search_foods('Offonlyfood', 20, true)), 1, 'and included with p_include_off = true');
select is((select count(*)::int from public.search_foods('Zzlimit', 100)), 50, 'p_limit is capped at 50');
select is((select count(*)::int from public.search_foods('Zzlimit')), 20, 'default limit is 20');
select is((select count(*)::int from public.search_foods('Zzlimit', 5)), 5, 'explicit limit is honoured');
select throws_ok($$ select * from public.search_foods('  ') $$, 'P0001', 'invalid_input', 'a blank query raises invalid_input');
select throws_ok($$ select * from public.search_foods(repeat('a', 101)) $$, 'P0001', 'invalid_input', 'a 101-character query raises invalid_input');
select throws_ok($$ select * from public.search_foods('banana', 0) $$, 'P0001', 'invalid_input', 'limit 0 raises invalid_input');
select throws_ok($$ select * from public.search_foods(null) $$, 'P0001', 'invalid_input', 'null query raises invalid_input');

reset role;
select * from finish();
rollback;
