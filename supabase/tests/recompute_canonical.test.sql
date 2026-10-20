-- pgTAP: food.recompute_canonical (spec 002, AC 26, 29 at SQL level).
begin;
select plan(28);

insert into food.releases (dataset, label, file_sha256) values ('usda_branded', 'test', repeat('e', 64));
insert into food.import_runs (mode, tool_version) values ('full', 'run-1'), ('full', 'run-2'), ('full', 'run-3'), ('full', 'run-4');
create function pg_temp.run(n integer) returns integer language sql as $$
  select id from (select id, row_number() over (order by id) rn from food.import_runs) r where rn = n
$$;

-- p_key doubles as source_ref, so the tie-break order is the order of the keys.
create function pg_temp.mk(p_key text, p_source food.source, p_tier food.tier, p_barcode text,
                           p_modified timestamptz default null, p_hidden food.reason_code default null,
                           p_canonical boolean default false, p_restricted boolean default false) returns void
language sql as $$
  insert into food.foods (
    id, source, dataset, tier, carbs_basis, is_canonical, barcode_restricted, hidden_reason, release_id, last_run_id,
    kcal, protein_g, carbs_g, fat_g, content_hash, source_ref, barcode, name_lang, name, upstream_modified_at
  ) values (
    md5(p_key)::uuid, p_source,
    case p_source when 'usda' then 'usda_branded'::food.dataset else 'off'::food.dataset end,
    p_tier, 'total', p_canonical, p_restricted, p_hidden,
    (select min(id) from food.releases), pg_temp.run(1),
    100, 1, 1, 1, 0, p_key, p_barcode, 'en', 'Food ' || p_key, p_modified
  );
$$;
create function pg_temp.canon(p_key text) returns boolean language sql as $$
  select is_canonical from food.foods where id = md5(p_key)::uuid
$$;

-- Ordering. Barcodes are 14-digit keys; none is restricted.
-- B1: tier beats source and date.
select pg_temp.mk('b1-off-verified', 'off', 'verified', '00000000100001');
select pg_temp.mk('b1-usda-brand', 'usda', 'brand', '00000000100001', '2026-01-01');
select pg_temp.mk('b1-usda-community', 'usda', 'community', '00000000100001', '2026-06-01');
-- B2: same tier, USDA beats OFF even when OFF is newer.
select pg_temp.mk('b2-off', 'off', 'brand', '00000000100002', '2026-09-01');
select pg_temp.mk('b2-usda', 'usda', 'brand', '00000000100002', '2025-01-01');
-- B3: same tier and source, the newer upstream date wins.
select pg_temp.mk('b3-old', 'usda', 'brand', '00000000100003', '2025-01-01');
select pg_temp.mk('b3-new', 'usda', 'brand', '00000000100003', '2026-01-01');
-- B4: a dated row beats a row with no date (nulls last).
select pg_temp.mk('b4-a-undated', 'usda', 'brand', '00000000100004', null);
select pg_temp.mk('b4-b-dated', 'usda', 'brand', '00000000100004', '2020-01-01');
-- B5: full tie, the lowest source_ref wins.
select pg_temp.mk('b5-b', 'usda', 'brand', '00000000100005', '2026-01-01');
select pg_temp.mk('b5-a', 'usda', 'brand', '00000000100005', '2026-01-01');
select pg_temp.mk('b5-c', 'usda', 'brand', '00000000100005', '2026-01-01');
-- No barcode, and a restricted barcode shared by two foods: never clustered, all visible rows are canonical.
select pg_temp.mk('n1', 'usda', 'brand', null);
select pg_temp.mk('n2-hidden', 'usda', 'brand', null, null, 'removed_upstream');
select pg_temp.mk('r1', 'usda', 'brand', '02000000000015', null, null, false, true);
select pg_temp.mk('r2', 'off', 'community', '02000000000015', null, null, false, true);

select is(food.recompute_canonical(pg_temp.run(2)), 8, 'first run marks 8 rows (one per cluster, plus unclustered visible rows)');
select is(pg_temp.canon('b1-off-verified'), true, 'B1: highest tier wins, even for OFF over USDA');
select is(pg_temp.canon('b1-usda-brand') or pg_temp.canon('b1-usda-community'), false, 'B1: lower tiers are not canonical');
select is(pg_temp.canon('b2-usda'), true, 'B2: at equal tier USDA wins over OFF');
select is(pg_temp.canon('b2-off'), false, 'B2: the OFF member is not canonical');
select is(pg_temp.canon('b3-new'), true, 'B3: most recently updated upstream wins');
select is(pg_temp.canon('b3-old'), false, 'B3: the older member is not canonical');
select is(pg_temp.canon('b4-b-dated'), true, 'B4: a known date beats an unknown one');
select is(pg_temp.canon('b5-a'), true, 'B5: lowest source_ref wins a full tie');
select is(pg_temp.canon('b5-b') or pg_temp.canon('b5-c'), false, 'B5: the others are not canonical');
select is(pg_temp.canon('n1'), true, 'a visible row without a barcode is canonical');
select is(pg_temp.canon('n2-hidden'), false, 'a hidden row is never canonical');
select is(pg_temp.canon('r1') and pg_temp.canon('r2'), true, 'restricted barcodes are not clustered: both rows are canonical');
select is(
  (select count(*)::int from food.foods where last_run_id = pg_temp.run(2)), 8,
  'every changed row carries the run id');

-- Idempotence: a second run changes nothing and touches nothing.
update food.foods set updated_at = '2000-01-01';
select is(food.recompute_canonical(pg_temp.run(3)), 0, 're-running returns 0 changed rows');
select is((select count(*)::int from food.foods where last_run_id = pg_temp.run(3)), 0, 're-running touches no row (last_run_id)');
select is((select count(*)::int from food.foods where updated_at <> '2000-01-01'), 0, 're-running touches no row (updated_at)');

-- AC 29: a hidden canonical hands over to the next best member. The hidden row keeps its flag until recompute.
update food.foods set hidden_reason = 'removed_upstream' where id = md5('b1-off-verified')::uuid;
select lives_ok($$ select food.recompute_canonical(pg_temp.run(3)) $$, 'handover swaps canonical without violating the unique index');
select is(pg_temp.canon('b1-off-verified'), false, 'the hidden member loses canonical');
select is(pg_temp.canon('b1-usda-brand'), true, 'the next best visible member (brand beats community) becomes canonical');
select is(
  (select count(*)::int from food.foods where barcode = '00000000100001' and is_canonical and hidden_reason is null), 1,
  'exactly one visible canonical row in the cluster');

-- A better row appears while an older one is canonical: swap in one call.
select pg_temp.mk('b6-old', 'off', 'community', '00000000100006', null, null, true);
select pg_temp.mk('b6-new', 'usda', 'verified', '00000000100006');
select lives_ok($$ select food.recompute_canonical(pg_temp.run(4)) $$, 'a new better member displaces the canonical one without an index violation');
select is(pg_temp.canon('b6-new') and not pg_temp.canon('b6-old'), true, 'the better member is canonical, the old one cleared');

-- A cluster whose members are all hidden has no canonical (nothing surfaces).
update food.foods set hidden_reason = 'removed_upstream' where barcode = '00000000100003';
select food.recompute_canonical(pg_temp.run(4));
select is(
  (select count(*)::int from food.foods where barcode = '00000000100003' and is_canonical), 0,
  'all members hidden: the cluster has no canonical');

-- Unhiding brings the cluster back with the same winner as before.
update food.foods set hidden_reason = null where barcode = '00000000100003';
select food.recompute_canonical(pg_temp.run(4));
select is(pg_temp.canon('b3-new'), true, 'unhidden members: the deterministic winner returns');

-- Final state is stable: running again is a no-op.
select is(food.recompute_canonical(pg_temp.run(4)), 0, 'stable after the scenario: 0 changed rows');

-- Executable by the importer only.
-- pgTAP lives in schema extensions; the importer needs usage only to call the test helpers.
grant usage on schema extensions to food_importer;
set local role food_importer;
select lives_ok($$ select food.recompute_canonical(pg_temp.run(4)) $$, 'food_importer can execute it');
reset role;
set local role authenticated;
select throws_ok($$ select food.recompute_canonical(1) $$, '42501', null, 'authenticated cannot execute it');
reset role;

select * from finish();
rollback;
