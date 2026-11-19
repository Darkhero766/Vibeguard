-- PROPOSAL ONLY. NOT a deployable migration. DO NOT APPLY to live Supabase.
-- See Phase 1 security runbook for staging prerequisites and rollback review.
-- Encrypted GitHub OAuth credentials are backend-owned, NOT client data.
-- Backend now accesses github_tokens through @workspace/db with a privileged
-- server-only DB role; browsers use GET /api/github/token/status only.
BEGIN;
REVOKE ALL PRIVILEGES ON TABLE public.github_tokens FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS "Users can manage their own github token" ON public.github_tokens;
-- Defense in depth. No anon or authenticated policy grants access to tokens.
ALTER TABLE public.github_tokens ENABLE ROW LEVEL SECURITY;

-- Audit records may be read by the owner but must not be client-writable.
REVOKE ALL PRIVILEGES ON TABLE public.audit_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.audit_runs TO authenticated;
-- Keep existing owner-scoped audit_runs_select_own SELECT policy.
COMMIT;

-- Approve only after staging verification of GitHub OAuth connect,
-- server-side token encrypted storage, listing, disconnect, audit creation,
-- audit listing, and service-side access; verify backend DB role permissions.
--
-- Read-only after-state assertions:
-- SELECT has_table_privilege('authenticated','public.github_tokens','SELECT'),
--        has_table_privilege('authenticated','public.github_tokens','INSERT'),
--        has_table_privilege('authenticated','public.github_tokens','UPDATE'),
--        has_table_privilege('anon','public.github_tokens','SELECT'),
--        has_table_privilege('authenticated','public.audit_runs','SELECT'),
--        has_table_privilege('authenticated','public.audit_runs','INSERT');
-- Expected: false, false, false, false, true, false.
--
-- Never roll back by returning client roles to unrestricted access.
