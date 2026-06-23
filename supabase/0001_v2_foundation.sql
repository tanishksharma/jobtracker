-- V2 foundation schema for the hosted job tracker.
-- Run in the Supabase dashboard: SQL Editor -> New query -> paste all -> Run.
-- Safe to re-run (uses IF NOT EXISTS / OR REPLACE / DROP-then-CREATE).

-- =========================================================================
-- 1. profiles: one row per user, created automatically on signup.
-- =========================================================================
create table if not exists public.profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "own profile - select" on public.profiles;
create policy "own profile - select" on public.profiles
  for select using (auth.uid() = user_id);

drop policy if exists "own profile - update" on public.profiles;
create policy "own profile - update" on public.profiles
  for update using (auth.uid() = user_id);

-- Auto-create a profile row whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =========================================================================
-- 2. companies: the tracker data, isolated per user.
--    Columns mirror the V1 tracker.csv fields.
-- =========================================================================
create table if not exists public.companies (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid()
                    references auth.users (id) on delete cascade,
  company         text not null default '',
  status          text default '',
  priority        text default '',
  market          text default '',
  type            text default '',
  compensation    text default '',
  outlook         text default '',
  size            text default '',
  website         text default '',
  about           text default '',
  how_to_apply    text default '',
  contact_details text default '',
  scope_of_ai     text default '',
  tips            text default '',
  content         text default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.companies enable row level security;

drop policy if exists "own companies - select" on public.companies;
create policy "own companies - select" on public.companies
  for select using (auth.uid() = user_id);

drop policy if exists "own companies - insert" on public.companies;
create policy "own companies - insert" on public.companies
  for insert with check (auth.uid() = user_id);

drop policy if exists "own companies - update" on public.companies;
create policy "own companies - update" on public.companies
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own companies - delete" on public.companies;
create policy "own companies - delete" on public.companies
  for delete using (auth.uid() = user_id);

create index if not exists companies_user_id_idx on public.companies (user_id);

-- Keep updated_at fresh on every change.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists companies_touch on public.companies;
create trigger companies_touch before update on public.companies
  for each row execute function public.touch_updated_at();
