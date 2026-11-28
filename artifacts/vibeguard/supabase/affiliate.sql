-- VibeSane Refer & Earn
-- Run this in the Supabase SQL editor before enabling the affiliate dashboard.

create table if not exists public.affiliate_profiles (
  owner uuid primary key references auth.users(id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.affiliate_referrals (
  id uuid primary key default gen_random_uuid(),
  affiliate_owner uuid not null references auth.users(id) on delete cascade,
  referred_user uuid not null unique references auth.users(id) on delete cascade,
  code text not null references public.affiliate_profiles(code) on update cascade,
  status text not null default 'signed_up' check (status in ('signed_up', 'paid', 'rejected')),
  commission_cents integer not null default 500 check (commission_cents >= 0),
  payment_reference text,
  created_at timestamptz not null default now(),
  converted_at timestamptz
);

create index if not exists affiliate_referrals_owner_idx on public.affiliate_referrals(affiliate_owner, created_at desc);

alter table public.affiliate_profiles enable row level security;
alter table public.affiliate_referrals enable row level security;

drop policy if exists "affiliate profile owner read" on public.affiliate_profiles;
create policy "affiliate profile owner read" on public.affiliate_profiles
  for select to authenticated using (owner = auth.uid());

drop policy if exists "affiliate profile owner insert" on public.affiliate_profiles;
create policy "affiliate profile owner insert" on public.affiliate_profiles
  for insert to authenticated with check (owner = auth.uid());

drop policy if exists "affiliate referrals owner read" on public.affiliate_referrals;
create policy "affiliate referrals owner read" on public.affiliate_referrals
  for select to authenticated using (affiliate_owner = auth.uid());

-- Claim attribution from the referral code stored during signup.
-- This prevents a user from referring themselves and prevents duplicate attribution.
create or replace function public.claim_affiliate_referral(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  affiliate public.affiliate_profiles%rowtype;
begin
  if auth.uid() is null then return false; end if;

  select * into affiliate from public.affiliate_profiles where code = upper(trim(p_code));
  if not found or affiliate.owner = auth.uid() then return false; end if;

  insert into public.affiliate_referrals (affiliate_owner, referred_user, code)
  values (affiliate.owner, auth.uid(), affiliate.code)
  on conflict (referred_user) do nothing;

  return true;
end;
$$;

-- Payment systems should call this through a trusted server/service-role context
-- after a successful $10 subscription. It is deliberately not executable by clients.
create or replace function public.mark_affiliate_paid(p_referred_user uuid, p_payment_reference text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required';
  end if;

  update public.affiliate_referrals
  set status = 'paid',
      payment_reference = coalesce(p_payment_reference, payment_reference),
      converted_at = coalesce(converted_at, now())
  where referred_user = p_referred_user
    and status = 'signed_up';

  return found;
end;
$$;

revoke all on function public.mark_affiliate_paid(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_affiliate_referral(text) to authenticated;
