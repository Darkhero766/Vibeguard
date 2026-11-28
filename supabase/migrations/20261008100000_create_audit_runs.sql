create extension if not exists pgcrypto;

create table if not exists public.audit_runs (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade,
  url text not null,
  scanned_at timestamptz not null default now(),
  score integer not null check (score between 0 and 100),
  passed integer not null default 0 check (passed >= 0),
  review integer not null default 0 check (review >= 0),
  missing integer not null default 0 check (missing >= 0),
  not_applicable integer not null default 0 check (not_applicable >= 0),
  redirect_count integer not null default 0 check (redirect_count >= 0),
  product_context jsonb not null default '{}'::jsonb,
  checks jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_runs_owner_scanned_at_idx
  on public.audit_runs(owner, scanned_at desc);

alter table public.audit_runs enable row level security;

drop policy if exists "audit_runs_select_own" on public.audit_runs;
create policy "audit_runs_select_own"
  on public.audit_runs
  for select
  to authenticated
  using (auth.uid() = owner);

revoke all on public.audit_runs from anon;
grant select on public.audit_runs to authenticated;
