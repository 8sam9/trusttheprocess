-- Spec 002 (002a, tasks B1 + B2): food catalogue schema, importer role, RLS and read RPCs.
-- ADR 0006: schema `food` is not exposed to the Data API. Clients read only through the SECURITY INVOKER RPCs in
-- `public` (get_foods, lookup_barcode, search_foods); the single writer is the NOLOGIN role `food_importer`
-- (a human enables login on a remote project, H5). Nothing in user data references this schema (no foreign keys).
-- Additive only. No destructive statements.

create extension if not exists pg_trgm with schema extensions;

create schema food;
comment on schema food is 'Food catalogue (spec 002, ADR 0006). Not exposed to the Data API; read via public RPCs.';
revoke all on schema food from public, anon, authenticated;
grant usage on schema food to authenticated;            -- needed by the SECURITY INVOKER RPCs

create type food.source as enum ('usda', 'off');
-- Enum order matters: recompute_canonical ranks tier (verified first) and source (usda first) by enum order.
create type food.dataset as enum ('usda_foundation', 'usda_sr_legacy', 'usda_fndds', 'usda_branded', 'off');
create type food.tier as enum ('verified', 'brand', 'community');
create type food.carbs_basis as enum ('total', 'available', 'unknown');
create type food.market as enum ('us', 'it', 'gb', 'ie', 'ca', 'au', 'nz');
create type food.reason_code as enum (
  -- soft flags (stored in reasons[])
  'energy_from_kj', 'volume_basis_assumed', 'invalid_barcode', 'restricted_barcode', 'energy_atwater_mismatch',
  'sugars_over_carbs', 'satfat_over_fat', 'sodium_implausible', 'energy_unit_mismatch',
  -- hide reasons (stored in hidden_reason)
  'superseded', 'removed_upstream', 'not_selected', 'over_budget',
  'missing_core', 'negative_value', 'mass_over_100g', 'energy_too_high', 'energy_implausible', 'no_name');
-- Skip-only reasons (no_accepted_name, not_in_market, no_valid_barcode, prepared_only, non_food, discontinued,
-- parse_error) exist only in the importer/report, never in the DB.

-- Roles are cluster-wide, so tolerate an existing one (for example a re-applied migration on a shared cluster).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'food_importer') then
    create role food_importer nologin;
  end if;
end;
$$;

-- On PG16+ a non-superuser creator (the CLI's `postgres`) gets ADMIN but not SET on a role it creates. Give it SET so
-- tests and operators can `set role food_importer`. Best effort: never fail the migration over it.
do $$
begin
  if current_setting('server_version_num')::int >= 160000
     and not pg_has_role(current_user, 'food_importer', 'set') then
    execute format('grant food_importer to %I with set true', current_user);
  end if;
exception when others then
  raise warning 'could not grant SET on food_importer to %: %', current_user, sqlerrm;
end;
$$;

create table food.releases (
  id smallint generated always as identity primary key,
  dataset food.dataset not null,
  label text not null check (char_length(label) between 1 and 64),        -- e.g. '2026-04-30', OFF dump date
  file_sha256 text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  unique (dataset, label, file_sha256)
);

create type food.run_status as enum ('running', 'succeeded', 'failed', 'aborted');
create table food.import_runs (
  id integer generated always as identity primary key,
  status food.run_status not null default 'running',
  mode text not null check (mode in ('full', 'partial')),   -- dry runs are never persisted (AC 52)
  tool_version text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  report jsonb                                              -- RunReport (T5.6); no user, diary or contributor data
);

create table food.foods (
  id uuid primary key,                                      -- uuidv5(FOOD_ID_NAMESPACE, dataset || ':' || source_ref)
  source food.source not null,
  dataset food.dataset not null,
  tier food.tier not null,
  carbs_basis food.carbs_basis not null,
  is_canonical boolean not null default false,
  barcode_restricted boolean not null default false,
  release_id smallint not null references food.releases (id),
  last_run_id integer not null references food.import_runs (id),
  hidden_reason food.reason_code check (hidden_reason is null or hidden_reason in (
    'superseded', 'removed_upstream', 'not_selected', 'over_budget', 'missing_core', 'negative_value',
    'mass_over_100g', 'energy_too_high', 'energy_implausible', 'no_name')),
  -- canonical nutrients per 100 g (as published; carbs on carbs_basis). NULL = unknown, 0 = known zero (AC 10).
  kcal real not null check (kcal between 0 and 905),
  protein_g real not null check (protein_g between 0 and 100),
  carbs_g real not null check (carbs_g between 0 and 100),
  fat_g real not null check (fat_g between 0 and 100),
  fibre_g real check (fibre_g between 0 and 100),
  sugars_g real check (sugars_g between 0 and 100),
  satfat_g real check (satfat_g between 0 and 100),
  sodium_mg real check (sodium_mg between 0 and 100000),
  popularity integer check (popularity >= 0),               -- OFF unique_scans_n only; null for USDA
  content_hash bigint not null,                             -- first 8 bytes of sha256(canonical JSON of normalised row)
  upstream_modified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),            -- the importer sets it explicitly only when it writes a change
  source_ref text not null check (char_length(source_ref) between 1 and 64),
  upstream_id text check (char_length(upstream_id) <= 64),  -- current fdcId (USDA); null for OFF
  barcode text check (barcode ~ '^[0-9]{14}$'),             -- normalised GTIN-14; null if absent or invalid
  name_lang text not null check (name_lang in ('en', 'it')),
  markets food.market[] not null default '{}',
  reasons food.reason_code[] not null default '{}',
  name text not null check (char_length(name) between 1 and 200),
  brand text check (char_length(brand) between 1 and 120),
  alt_names jsonb check (alt_names is null or jsonb_typeof(alt_names) = 'object'),   -- {"it": "..."}
  servings jsonb not null default '[]' check (jsonb_typeof(servings) = 'array' and jsonb_array_length(servings) <= 10)
  -- each item {"label": text 1..80, "grams": number (0, 5000]}; validated by the importer (zod), not by SQL
);
comment on table food.foods is
  'Upstream foods (USDA FDC, Open Food Facts). Written only by tools/food-import as food_importer. No user data. OFF rows: ODbL, see food.off_foods.';

create index foods_last_run_idx on food.foods (last_run_id);                                    -- AC 54
create unique index foods_one_canonical_per_barcode on food.foods (barcode)                       -- AC 25-27
  where is_canonical and hidden_reason is null and barcode is not null and not barcode_restricted;
create index foods_search_trgm_idx on food.foods
  using gin ((name || ' ' || coalesce(brand, '')) extensions.gin_trgm_ops)
  where is_canonical and hidden_reason is null;                                                 -- AC 50; 003 may replace

-- Row Level Security. The catalogue holds no user data, so "authenticated may read everything" is the whole read
-- policy; hidden rows stay readable by id (AC 27, 33). Writes: nobody but food_importer (AC 39).
alter table food.foods enable row level security;
alter table food.releases enable row level security;
alter table food.import_runs enable row level security;
revoke all on all tables in schema food from public, anon, authenticated;
grant select on food.foods to authenticated;
create policy "foods: authenticated read" on food.foods for select to authenticated using (true);
-- No insert/update/delete grant or policy for authenticated or anon (AC 39).
-- import_runs / releases: no grant and no policy for clients (AC 53).

grant usage on schema food to food_importer;
revoke all on all tables in schema food from food_importer;
grant select, insert, update on food.foods, food.releases, food.import_runs to food_importer;   -- no DELETE
do $$
begin
  -- MAINTAIN (VACUUM/ANALYZE without ownership) exists from PG17; the local stack and Supabase are on 17.
  if current_setting('server_version_num')::int >= 170000 then
    execute 'grant maintain on food.foods to food_importer';
  end if;
end;
$$;

create policy "foods: importer read"   on food.foods for select to food_importer using (true);
create policy "foods: importer insert" on food.foods for insert to food_importer with check (true);
create policy "foods: importer update" on food.foods for update to food_importer using (true) with check (true);

create policy "releases: importer read"   on food.releases for select to food_importer using (true);
create policy "releases: importer insert" on food.releases for insert to food_importer with check (true);
create policy "releases: importer update" on food.releases for update to food_importer using (true) with check (true);

create policy "import_runs: importer read"   on food.import_runs for select to food_importer using (true);
create policy "import_runs: importer insert" on food.import_runs for insert to food_importer with check (true);
create policy "import_runs: importer update" on food.import_runs for update to food_importer using (true) with check (true);

-- ---------------------------------------------------------------------------------------------------------------
-- Canonical recompute (AC 26, 29), run by the importer in one transaction after all batches.
-- Winner per barcode among visible (hidden_reason is null), non-restricted rows: order by tier (verified > brand >
-- community), source (usda > off), upstream_modified_at desc nulls last, source_ref asc (then id, so the choice is
-- total and re-runs never flip it). Rows without a barcode or with a restricted barcode are never clustered:
-- canonical = visible. Hidden rows: canonical = false.
-- Two statements so the non-deferrable partial unique index never sees two canonical rows:
--   1) clear is_canonical where the computed winner differs; 2) set is_canonical for the new winners.
-- Changed rows get last_run_id = p_run and updated_at = now(); rows that already match are not touched.
-- Returns the number of rows changed.
create function food.recompute_canonical(p_run integer) returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_cleared integer;
  v_set integer;
begin
  with want as (
    select f.id, true as is_wanted
    from food.foods f
    where f.hidden_reason is null and (f.barcode is null or f.barcode_restricted)
    union all
    select r.id, r.rn = 1
    from (
      select f.id,
             row_number() over (
               partition by f.barcode
               order by f.tier, f.source, f.upstream_modified_at desc nulls last, f.source_ref, f.id
             ) as rn
      from food.foods f
      where f.hidden_reason is null and f.barcode is not null and not f.barcode_restricted
    ) r
  )
  update food.foods t
  set is_canonical = false, last_run_id = p_run, updated_at = now()
  where t.is_canonical
    and not exists (select 1 from want w where w.id = t.id and w.is_wanted);
  get diagnostics v_cleared = row_count;

  with want as (
    select f.id, true as is_wanted
    from food.foods f
    where f.hidden_reason is null and (f.barcode is null or f.barcode_restricted)
    union all
    select r.id, r.rn = 1
    from (
      select f.id,
             row_number() over (
               partition by f.barcode
               order by f.tier, f.source, f.upstream_modified_at desc nulls last, f.source_ref, f.id
             ) as rn
      from food.foods f
      where f.hidden_reason is null and f.barcode is not null and not f.barcode_restricted
    ) r
  )
  update food.foods t
  set is_canonical = true, last_run_id = p_run, updated_at = now()
  where not t.is_canonical
    and exists (select 1 from want w where w.id = t.id and w.is_wanted);
  get diagnostics v_set = row_count;

  return v_cleared + v_set;
end;
$$;
revoke execute on function food.recompute_canonical(integer) from public, anon, authenticated;
grant execute on function food.recompute_canonical(integer) to food_importer;

-- ---------------------------------------------------------------------------------------------------------------
-- Restricted-circulation GTIN ranges (T6.1). SQL twin of isRestrictedGtin14 in packages/shared/src/gtin.ts; keep
-- them identical (food_structure.test.sql checks parity on the same cases as gtin.test.ts). Takes a normalised
-- 14-digit key. The importer stores the result in foods.barcode_restricted; lookup_barcode uses it as a guard.
create function food.is_restricted_gtin14(g text) returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when g is null or g !~ '^[0-9]{14}$' then false
    -- GTIN-8 (key starts with six zeros): restricted when it starts with 0 or 2 (company RCN-8).
    when g like '000000%' then substr(g, 7, 1) in ('0', '2')
    -- GTIN-14 with a non-zero indicator digit is never restricted.
    when substr(g, 1, 1) <> '0' then false
    else substr(g, 2, 3)::int between 20 and 29       -- 020-029
      or substr(g, 2, 3)::int between 40 and 49       -- 040-049
      or substr(g, 2, 3)::int between 200 and 299     -- 200-299
      or substr(g, 2, 3)::int between 980 and 984     -- refund receipts, coupons
      or substr(g, 2, 2) = '99'                       -- coupons
  end;
$$;
revoke execute on function food.is_restricted_gtin14(text) from public, anon;
grant execute on function food.is_restricted_gtin14(text) to authenticated, food_importer;

-- FoodRow.reasons holds soft-flag codes only (packages/shared/src/foods.ts); hide reasons live in hidden_reason.
create function food.soft_flags(p_reasons food.reason_code[]) returns food.reason_code[]
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(array_agg(r.code order by r.ord), '{}'::food.reason_code[])
  from unnest(p_reasons) with ordinality as r(code, ord)
  where r.code in ('energy_from_kj', 'volume_basis_assumed', 'invalid_barcode', 'restricted_barcode',
                   'energy_atwater_mismatch', 'sugars_over_carbs', 'satfat_over_fat', 'sodium_implausible',
                   'energy_unit_mismatch');
$$;
revoke execute on function food.soft_flags(food.reason_code[]) from public, anon;
grant execute on function food.soft_flags(food.reason_code[]) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Read RPCs (B2). SECURITY INVOKER (run under the caller's RLS), stable, authenticated only. The returned columns
-- are exactly FoodRow in packages/shared/src/foods.ts: internal columns (content_hash, popularity, release_id,
-- last_run_id, upstream_id, markets, barcode_restricted, hidden_reason) are never returned.
--
-- p_include_off (default false): until the "Food data sources" attribution page ships (item 011) no OFF-derived
-- row may reach a user (AC 44, T8), so every RPC excludes source 'off' unless the caller opts in.
-- Errors are raised as the bare message `too_many_ids` / `invalid_input` (FoodRpcErrorCode).

create function public.get_foods(p_ids uuid[], p_include_off boolean default false)
returns table (
  id uuid, source food.source, dataset food.dataset, source_ref text, name text, name_lang text,
  alt_names jsonb, brand text, barcode text,
  kcal real, protein_g real, carbs_g real, fat_g real, fibre_g real, sugars_g real, satfat_g real, sodium_mg real,
  carbs_basis food.carbs_basis, tier food.tier, reasons food.reason_code[], hidden boolean, is_canonical boolean,
  servings jsonb, updated_at timestamptz
)
language plpgsql
security invoker
stable
set search_path = ''
as $$
begin
  if p_ids is null then
    raise exception 'invalid_input';
  end if;
  if cardinality(p_ids) > 200 then
    raise exception 'too_many_ids';
  end if;

  -- Hidden and non-canonical rows are returned too (AC 27, 33): a favourite or diary link must keep resolving.
  return query
  select f.id, f.source, f.dataset, f.source_ref, f.name, f.name_lang, f.alt_names, f.brand, f.barcode,
         f.kcal, f.protein_g, f.carbs_g, f.fat_g, f.fibre_g, f.sugars_g, f.satfat_g, f.sodium_mg,
         f.carbs_basis, f.tier, food.soft_flags(f.reasons), f.hidden_reason is not null, f.is_canonical,
         f.servings, f.updated_at
  from food.foods f
  where f.id = any (p_ids)
    and (coalesce(p_include_off, false) or f.source <> 'off')
  order by array_position(p_ids, f.id);
end;
$$;

create function public.lookup_barcode(p_gtin14 text, p_include_off boolean default false)
returns table (
  id uuid, source food.source, dataset food.dataset, source_ref text, name text, name_lang text,
  alt_names jsonb, brand text, barcode text,
  kcal real, protein_g real, carbs_g real, fat_g real, fibre_g real, sugars_g real, satfat_g real, sodium_mg real,
  carbs_basis food.carbs_basis, tier food.tier, reasons food.reason_code[], hidden boolean, is_canonical boolean,
  servings jsonb, updated_at timestamptz
)
language plpgsql
security invoker
stable
set search_path = ''
as $$
begin
  if p_gtin14 is null or p_gtin14 !~ '^[0-9]{14}$' then
    raise exception 'invalid_input';
  end if;
  -- In-store codes are not unique worldwide: never resolved (AC 16).
  if food.is_restricted_gtin14(p_gtin14) then
    return;
  end if;

  -- Visible, non-restricted rows only. Normally that is the canonical member. With OFF excluded the OFF filter is
  -- applied before the canonical choice: if the cluster's canonical is an OFF row, the best remaining USDA member
  -- is returned instead (tier, then upstream date, then source_ref, as in recompute_canonical).
  return query
  select f.id, f.source, f.dataset, f.source_ref, f.name, f.name_lang, f.alt_names, f.brand, f.barcode,
         f.kcal, f.protein_g, f.carbs_g, f.fat_g, f.fibre_g, f.sugars_g, f.satfat_g, f.sodium_mg,
         f.carbs_basis, f.tier, food.soft_flags(f.reasons), f.hidden_reason is not null, f.is_canonical,
         f.servings, f.updated_at
  from food.foods f
  where f.barcode = p_gtin14
    and f.hidden_reason is null
    and not f.barcode_restricted
    and (
      (f.is_canonical and (coalesce(p_include_off, false) or f.source <> 'off'))
      or (
        not coalesce(p_include_off, false)
        and f.source = 'usda'
        and not f.is_canonical
        and exists (
          select 1 from food.foods c
          where c.barcode = f.barcode and c.is_canonical and c.hidden_reason is null and c.source = 'off'
        )
      )
    )
  order by f.is_canonical desc, f.tier, f.source, f.upstream_modified_at desc nulls last, f.source_ref, f.id
  limit 1;
end;
$$;

-- Functional baseline for AC 50 only. 003 owns ranking and may replace the body while keeping the signature.
create function public.search_foods(p_query text, p_limit integer default 20, p_include_off boolean default false)
returns table (
  id uuid, source food.source, dataset food.dataset, source_ref text, name text, name_lang text,
  alt_names jsonb, brand text, barcode text,
  kcal real, protein_g real, carbs_g real, fat_g real, fibre_g real, sugars_g real, satfat_g real, sodium_mg real,
  carbs_basis food.carbs_basis, tier food.tier, reasons food.reason_code[], hidden boolean, is_canonical boolean,
  servings jsonb, updated_at timestamptz
)
language plpgsql
security invoker
stable
set search_path = ''
as $$
declare
  v_q text := btrim(p_query);
  v_like text;
  v_limit integer := least(coalesce(p_limit, 20), 50);
begin
  if v_q is null or char_length(v_q) not between 1 and 100 or v_limit < 1 then
    raise exception 'invalid_input';
  end if;
  -- Escape LIKE wildcards so the query is matched literally.
  v_like := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  -- The text expression matches foods_search_trgm_idx so the partial GIN index can serve both predicates.
  return query
  select f.id, f.source, f.dataset, f.source_ref, f.name, f.name_lang, f.alt_names, f.brand, f.barcode,
         f.kcal, f.protein_g, f.carbs_g, f.fat_g, f.fibre_g, f.sugars_g, f.satfat_g, f.sodium_mg,
         f.carbs_basis, f.tier, food.soft_flags(f.reasons), false, f.is_canonical,
         f.servings, f.updated_at
  from food.foods f
  where f.is_canonical
    and f.hidden_reason is null
    and (coalesce(p_include_off, false) or f.source <> 'off')
    and (
      (f.name || ' ' || coalesce(f.brand, '')) ilike v_like
      or (f.name || ' ' || coalesce(f.brand, '')) operator(extensions.%) v_q
    )
  order by extensions.similarity(f.name || ' ' || coalesce(f.brand, ''), v_q) desc,
           char_length(f.name), f.id
  limit v_limit;
end;
$$;

revoke execute on function public.get_foods(uuid[], boolean) from public, anon;
revoke execute on function public.lookup_barcode(text, boolean) from public, anon;
revoke execute on function public.search_foods(text, integer, boolean) from public, anon;
grant execute on function public.get_foods(uuid[], boolean) to authenticated;
grant execute on function public.lookup_barcode(text, boolean) to authenticated;
grant execute on function public.search_foods(text, integer, boolean) to authenticated;
