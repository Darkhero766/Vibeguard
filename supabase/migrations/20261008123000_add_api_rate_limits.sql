create table if not exists public.api_rate_limits (
  bucket_key text primary key,
  window_started_at timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.api_rate_limits enable row level security;

create policy "api rate limits deny direct client access"
  on public.api_rate_limits for all to anon, authenticated
  using (false) with check (false);

create index if not exists api_rate_limits_updated_at_idx
  on public.api_rate_limits(updated_at);

revoke all on public.api_rate_limits from anon, authenticated;