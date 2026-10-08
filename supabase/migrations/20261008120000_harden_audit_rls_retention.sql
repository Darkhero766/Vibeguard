alter policy audit_runs_select_own on public.audit_runs using ((select auth.uid()) = owner);

create policy "service-owned protected repositories deny direct client access"
  on public.protected_repositories for all to anon, authenticated using (false) with check (false);

create policy "service-owned protection events deny direct client access"
  on public.protection_events for all to anon, authenticated using (false) with check (false);

create policy "service-owned github installations deny direct client access"
  on public.github_app_installations for all to anon, authenticated using (false) with check (false);

create policy "service-owned dodo webhook events deny direct client access"
  on public.dodo_webhook_events for all to anon, authenticated using (false) with check (false);

create policy "users can view own hackathon redemption"
  on public.hackathon_redemptions for select to authenticated using ((select auth.uid()) = owner);

create policy "users can insert own hackathon redemption"
  on public.hackathon_redemptions for insert to authenticated with check ((select auth.uid()) = owner);

create policy "users can delete own hackathon redemption"
  on public.hackathon_redemptions for delete to authenticated using ((select auth.uid()) = owner);

create index if not exists audit_runs_owner_scanned_at_idx
  on public.audit_runs(owner, scanned_at desc);

create or replace function public.cleanup_old_audit_runs()
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare deleted_count integer;
begin
  delete from public.audit_runs where scanned_at < now() - interval '90 days';
  get diagnostics deleted_count = row_count;
  return deleted_count;
end
$$;

revoke all on function public.cleanup_old_audit_runs() from public, anon, authenticated;

create or replace function public.cleanup_old_audit_runs()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from public.audit_runs where scanned_at < now() - interval '90 days';
  return new;
end
$$;

revoke all on function public.cleanup_old_audit_runs() from public, anon, authenticated;

drop trigger if exists audit_runs_retention_trigger on public.audit_runs;
create trigger audit_runs_retention_trigger
after insert on public.audit_runs
for each statement execute function public.cleanup_old_audit_runs();
