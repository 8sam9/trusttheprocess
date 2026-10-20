-- pgTAP: food catalogue structure (spec 002, AC 32, 42, 54 and the T6.1 restricted-range twin).
begin;
select plan(46);

select has_schema('food', 'schema food exists');
select has_table('food', 'foods', 'food.foods exists');
select has_table('food', 'releases', 'food.releases exists');
select has_table('food', 'import_runs', 'food.import_runs exists');

-- AC 32: history is safe because nothing in user data can depend on the catalogue (ADR 0006 point 4).
select is(
  (select count(*)::int from pg_constraint where contype = 'f' and confrelid = 'food.foods'::regclass),
  0, 'no foreign key anywhere references food.foods');
select is(
  (select count(*)::int from pg_constraint c join pg_class t on t.oid = c.conrelid join pg_namespace n on n.oid = t.relnamespace
   where c.contype = 'f' and n.nspname = 'public' and c.confrelid in ('food.foods'::regclass, 'food.releases'::regclass, 'food.import_runs'::regclass)),
  0, 'no public table has a foreign key into the food schema');
select is(
  (select count(*)::int from pg_trigger where tgrelid = 'food.foods'::regclass and not tgisinternal),
  0, 'no triggers on food.foods');

-- AC 42: provenance on every row.
select col_not_null('food', 'foods', 'source', 'source is NOT NULL');
select col_not_null('food', 'foods', 'dataset', 'dataset is NOT NULL');
select col_not_null('food', 'foods', 'source_ref', 'source_ref is NOT NULL');
select col_not_null('food', 'foods', 'release_id', 'release_id is NOT NULL');
select col_not_null('food', 'foods', 'last_run_id', 'last_run_id is NOT NULL');
select col_not_null('food', 'foods', 'tier', 'tier is NOT NULL (AC 23)');
select col_not_null('food', 'foods', 'carbs_basis', 'carbs_basis is NOT NULL (AC 13)');
select col_not_null('food', 'foods', 'content_hash', 'content_hash is NOT NULL');
select col_is_null('food', 'foods', 'fibre_g', 'fibre_g can be unknown (AC 10)');
select col_is_null('food', 'foods', 'sodium_mg', 'sodium_mg can be unknown (AC 10)');
select fk_ok('food', 'foods', 'release_id', 'food', 'releases', 'id', 'foods.release_id references releases');
select fk_ok('food', 'foods', 'last_run_id', 'food', 'import_runs', 'id', 'foods.last_run_id references import_runs');

-- Indexes (AC 25-27, 54).
select has_index('food', 'foods', 'foods_one_canonical_per_barcode', 'canonical-per-barcode index exists');
select is(
  (select i.indisunique from pg_index i where i.indexrelid = 'food.foods_one_canonical_per_barcode'::regclass),
  true, 'and it is unique');
select has_index('food', 'foods', 'foods_last_run_idx', 'last_run_id index exists (AC 54)');
select has_index('food', 'foods', 'foods_search_trgm_idx', 'trigram search index exists (AC 50)');

-- Fixtures for the constraint checks.
insert into food.releases (dataset, label, file_sha256) values ('usda_branded', 'test', repeat('d', 64));
insert into food.import_runs (mode, tool_version) values ('full', 'test');
create function pg_temp.ins(p_key text, p_barcode text default null, p_canonical boolean default false,
                            p_hidden food.reason_code default null, p_restricted boolean default false,
                            p_kcal real default 100, p_servings jsonb default '[]', p_alt jsonb default null,
                            p_reasons food.reason_code[] default '{}') returns void
language sql as $$
  insert into food.foods (
    id, source, dataset, tier, carbs_basis, is_canonical, barcode_restricted, hidden_reason, release_id, last_run_id,
    kcal, protein_g, carbs_g, fat_g, content_hash, source_ref, barcode, name_lang, name, servings, alt_names, reasons
  ) values (
    md5(p_key)::uuid, 'usda', 'usda_branded', 'brand', 'total', p_canonical, p_restricted, p_hidden,
    (select min(id) from food.releases), (select min(id) from food.import_runs),
    p_kcal, 1, 1, 1, 0, p_key, p_barcode, 'en', 'Food ' || p_key, p_servings, p_alt, p_reasons
  );
$$;

-- AC 25: at most one visible canonical row per barcode.
select lives_ok($$ select pg_temp.ins('c1', '00036000291452', true) $$, 'first canonical row for a barcode inserts');
select throws_ok($$ select pg_temp.ins('c2', '00036000291452', true) $$, '23505', null, 'a second visible canonical row for the barcode is rejected');
select lives_ok($$ select pg_temp.ins('c3', '00036000291452', false) $$, 'non-canonical members are allowed');
select lives_ok($$ select pg_temp.ins('c4', '00036000291452', true, 'superseded') $$, 'a hidden row may carry is_canonical without conflict');
select lives_ok($$ select pg_temp.ins('c5', '02000000000015', true, null, true) $$, 'restricted barcode, canonical, inserts');
select lives_ok($$ select pg_temp.ins('c6', '02000000000015', true, null, true) $$, 'restricted barcodes are never constrained to one canonical row');
select lives_ok($$ select pg_temp.ins('c7', null, true) $$, 'rows without a barcode may all be canonical');
select lives_ok($$ select pg_temp.ins('c8', null, true) $$, 'a second row without a barcode is fine');

-- Value checks (AC 19 backstop, AC 18).
select throws_ok($$ select pg_temp.ins('v1', p_kcal => 906) $$, '23514', null, 'kcal above 905 is rejected');
select throws_ok($$ select pg_temp.ins('v2', p_kcal => -1) $$, '23514', null, 'negative kcal is rejected');
select throws_ok($$ select pg_temp.ins('v3', p_barcode => '12345') $$, '23514', null, 'barcode must be a 14-digit key');
select throws_ok($$ select pg_temp.ins('v4', p_servings => (select jsonb_agg(jsonb_build_object('label', 's' || i, 'grams', 1)) from generate_series(1, 11) i)) $$,
  '23514', null, 'more than 10 servings is rejected');
select lives_ok($$ select pg_temp.ins('v5', p_servings => (select jsonb_agg(jsonb_build_object('label', 's' || i, 'grams', 1)) from generate_series(1, 10) i)) $$,
  'exactly 10 servings is accepted');
select throws_ok($$ select pg_temp.ins('v6', p_alt => '["x"]') $$, '23514', null, 'alt_names must be an object');
select throws_ok($$ select pg_temp.ins('v7', p_hidden => 'energy_from_kj') $$, '23514', null, 'a soft flag cannot be a hidden_reason');

-- Restricted-range parity with packages/shared/src/gtin.ts (isRestrictedGtin14), same cases as gtin.test.ts.
create function pg_temp.with_check(body text) returns text language sql as $$
  select body || ((10 - (sum(substr(body, length(body) - i, 1)::int * case when i % 2 = 0 then 3 else 1 end) % 10)) % 10)::text
  from generate_series(0, length(body) - 1) i
$$;
create function pg_temp.ean13(prefix text) returns text language sql as $$
  select pg_temp.with_check(rpad(prefix, 12, '1'))
$$;
select is(
  (select array_agg(p order by p) from unnest(array['020','024','029','040','045','049','200','250','299','980','981','982','983','984','990','995','999']) p
   where not food.is_restricted_gtin14('0' || pg_temp.ean13(p))),
  null, 'restricted GTIN-13 prefixes (020-029, 040-049, 200-299, 980-984, 99x) are restricted');
select is(
  (select array_agg(p order by p) from unnest(array['019','030','039','050','199','300','400','500','800','977','978','979','985','989']) p
   where food.is_restricted_gtin14('0' || pg_temp.ean13(p))),
  null, 'neighbouring prefixes and ISSN/ISBN (977-979) are not restricted');
select is(food.is_restricted_gtin14('00' || pg_temp.with_check('21234567890')), true, 'UPC-A starting with 2 is restricted (as a 14-digit key)');
select is(food.is_restricted_gtin14('00' || pg_temp.with_check('41234567890')), true, 'UPC-A starting with 4 is restricted');
select is(food.is_restricted_gtin14('00' || pg_temp.with_check('31234567890')), false, 'UPC-A starting with 3 is not restricted');
select is(
  (select array_agg(d order by d) from unnest(array['0','2']) d where not food.is_restricted_gtin14('000000' || pg_temp.with_check(d || '123456'))) is null
  and not exists (select 1 from unnest(array['1','3','4','5','9']) d where food.is_restricted_gtin14('000000' || pg_temp.with_check(d || '123456'))),
  true, 'GTIN-8 starting with 0 or 2 is restricted; other starts are not');
select is(
  food.is_restricted_gtin14(pg_temp.with_check('1200000000001')) or food.is_restricted_gtin14('00000096385074')
  or food.is_restricted_gtin14('') or food.is_restricted_gtin14('2000000000000') or food.is_restricted_gtin14('0200000000000a') or food.is_restricted_gtin14(null),
  false, 'indicator-digit GTIN-14, a real EAN-8, and non-14-digit input are not restricted');
select is(food.is_restricted_gtin14('00000020000008'), true, 'GTIN-8 key 00000020000008 is restricted');

select * from finish();
rollback;
