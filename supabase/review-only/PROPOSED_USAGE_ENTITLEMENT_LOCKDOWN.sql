-- REVIEW-ONLY PROPOSAL — DO NOT EXECUTE IN AUTOMATED CI OR APPLY TO HOSTED DB
-- Security finding: authenticated users currently have UPDATE privileges on plan,
-- quota counters, Dodo subscription fields and expiration fields in public.usage.
-- RLS restricts the row owner, NOT the editable column set.
-- Current backend authoritative billing/quota writes use a privileged pool connection.
-- The browser has been changed to SELECT-only usage reads in this feature branch.
--
-- BEFORE APPLYING:
-- 1. Verify the deployment uses privileged backend DB connections for billing,
--    ensurePlanForUser, consume*Scan, and the signup trigger.
-- 2. Test new registration, plan/checkout sync, scan quota, entitlement reads on staging.
-- 3. Verify current Supabase/CLI commands and produce a canonical migration file.
-- 4. Obtain explicit approval, maintenance/rollback plan, and a DB backup.
-- 5. Review github_tokens grants separately; not modified here.
--
-- BEGIN REVIEWED TRANSACTION (NOT AUTOMATICALLY EXECUTED):
BEGIN;
REVOKE ALL PRIVILEGES ON TABLE public.usage FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.usage TO authenticated;
DROP POLICY IF EXISTS "Users can update their own usage" ON public.usage;
DROP POLICY IF EXISTS "Users can insert their own usage" ON public.usage;
-- Keep "Users can view their own usage" SELECT RLS policy so authenticated
-- users can only read their own records.
COMMIT;
--
-- READ-ONLY VERIFICATION AFTER AN APPROVED DEPLOYMENT:
-- SELECT has_table_privilege('authenticated','public.usage','UPDATE') AS can_update,
--        has_table_privilege('authenticated','public.usage','INSERT') AS can_insert,
--        has_table_privilege('authenticated','public.usage','SELECT') AS can_read;
-- Expected: false, false, true.
-- SELECT policyname, cmd FROM pg_policies
-- WHERE schemaname='public' AND tablename='usage';
-- Expected: only the original owner-scoped SELECT policy.
--
-- ROLLBACK DECISION: do NOT silently restore permissive INSERT/UPDATE grants.
-- If entitlement reads break, investigate backend connection privileges first.
-- Emergency restoration of authenticated DML would reintroduce a security risk and
-- requires a separate security-approved remediation path.
