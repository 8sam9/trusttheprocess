-- Milestone 0: user profiles.
-- One row per auth user, created automatically on sign-up. Deleted by cascade when the auth user is deleted.

create type public.biological_sex as enum ('female', 'male', 'unspecified');
create type public.activity_level as enum ('sedentary', 'light', 'moderate', 'active', 'very_active');
create type public.goal as enum ('lose', 'maintain', 'gain');
create type public.unit_system as enum ('metric', 'imperial');

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) between 1 and 50),
  sex public.biological_sex,
  birth_year smallint check (birth_year between 1900 and 2100),
  height_cm numeric(4, 1) check (height_cm between 100 and 250),
  activity_level public.activity_level,
  goal public.goal,
  weekly_rate_kg numeric(3, 2) check (weekly_rate_kg between 0 and 1),
  units public.unit_system not null default 'metric',
  timezone text not null default 'UTC',
  -- GDPR art. 9: explicit consent to process health data, required before any diary/weight data is stored.
  health_data_consent_at timestamptz,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'User profile and inputs for calorie/macro target calculation. Health data: GDPR special category.';

-- Keep updated_at fresh.
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- Create the profile row when a user signs up.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id) values (new.id);
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Row Level Security: a user can only see and change their own profile.
-- No insert policy (trigger creates the row) and no delete policy (account deletion cascades from auth.users).
alter table public.profiles enable row level security;

-- Supabase grants ALL on new public tables to anon/authenticated by default; start from zero instead.
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
-- Column-level update grant: user_id, consent and timestamps are not user-editable via the API.
grant update (
  display_name, sex, birth_year, height_cm, activity_level, goal, weekly_rate_kg, units, timezone,
  onboarding_completed_at
) on table public.profiles to authenticated;

create policy "profiles: read own"
on public.profiles for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "profiles: update own"
on public.profiles for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- Health-data consent (GDPR art. 9). Only settable through these functions, always for the caller.
create function public.give_health_data_consent()
returns timestamptz
language sql
security definer
set search_path = ''
as $$
  update public.profiles set health_data_consent_at = now()
  where user_id = (select auth.uid())
  returning health_data_consent_at;
$$;

create function public.withdraw_health_data_consent()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles set health_data_consent_at = null
  where user_id = (select auth.uid());
$$;

revoke execute on function public.give_health_data_consent() from public, anon;
revoke execute on function public.withdraw_health_data_consent() from public, anon;
grant execute on function public.give_health_data_consent() to authenticated;
grant execute on function public.withdraw_health_data_consent() to authenticated;
