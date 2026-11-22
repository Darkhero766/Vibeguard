-- STAGING ONLY: clean isolated Supabase project (VibeSane-staging).
-- NEVER apply this baseline bootstrap to the existing production project.
-- No production customer rows, OAuth secrets, billing records or credentials.
-- Fresh intended locked-down permissions, not a reproduction of old grants.

CREATE TABLE public.usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scans_used integer NOT NULL DEFAULT 0,
  scans_limit integer NOT NULL DEFAULT 1,
  reset_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  plan text NOT NULL DEFAULT 'free',
  pro_expires_at timestamptz,
  monthly_scans_used integer NOT NULL DEFAULT 0,
  monthly_scans_limit integer NOT NULL DEFAULT 1,
  monthly_reset_at timestamptz,
  dodo_customer_id text,
  dodo_subscription_id text,
  dodo_subscription_status text,
  pro_source text,
  pro_started_at timestamptz,
  protected_scans_used integer NOT NULL DEFAULT 0,
  public_scans_used integer NOT NULL DEFAULT 0,
  audit_scans_used integer NOT NULL DEFAULT 0,
  CONSTRAINT usage_owner_unique UNIQUE (owner)
);
CREATE INDEX usage_dodo_subscription_idx ON public.usage (dodo_subscription_id);
CREATE INDEX usage_plan_idx ON public.usage (plan);
CREATE INDEX usage_pro_expires_idx ON public.usage (pro_expires_at);

CREATE TABLE public.github_tokens (
  owner uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  encrypted_token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.github_app_installations (
  owner uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  installation_id bigint NOT NULL UNIQUE,
  account_login text NOT NULL,
  account_id bigint NOT NULL,
  account_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX github_app_installations_owner_idx ON public.github_app_installations (owner);
CREATE INDEX github_app_installations_account_idx ON public.github_app_installations (account_login);

CREATE TABLE public.protected_repositories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  repo text NOT NULL UNIQUE,
  repo_url text NOT NULL,
  baseline_sha text NOT NULL,
  last_sha text NOT NULL,
  status text NOT NULL DEFAULT 'protected',
  last_score integer NOT NULL DEFAULT 100,
  critical_count integer NOT NULL DEFAULT 0,
  high_count integer NOT NULL DEFAULT 0,
  medium_count integer NOT NULL DEFAULT 0,
  last_event text,
  last_event_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX protected_repositories_owner_idx ON public.protected_repositories (owner);

CREATE TABLE public.protection_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repo text NOT NULL,
  event text NOT NULL,
  sha text NOT NULL,
  status text NOT NULL,
  findings_count integer NOT NULL DEFAULT 0,
  critical_count integer NOT NULL DEFAULT 0,
  high_count integer NOT NULL DEFAULT 0,
  medium_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX protection_events_repo_idx ON public.protection_events (repo);
CREATE INDEX protection_events_repo_created_idx ON public.protection_events (repo, created_at DESC);

CREATE TABLE public.audit_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url text NOT NULL,
  scanned_at timestamptz NOT NULL DEFAULT now(),
  score integer NOT NULL CHECK (score BETWEEN 0 AND 100),
  passed integer NOT NULL DEFAULT 0 CHECK (passed >= 0),
  review integer NOT NULL DEFAULT 0 CHECK (review >= 0),
  missing integer NOT NULL DEFAULT 0 CHECK (missing >= 0),
  not_applicable integer NOT NULL DEFAULT 0 CHECK (not_applicable >= 0),
  redirect_count integer NOT NULL DEFAULT 0 CHECK (redirect_count >= 0),
  product_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  checks jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_runs_owner_scanned_at_idx ON public.audit_runs (owner, scanned_at DESC);

CREATE TABLE public.api_rate_limits (
  bucket_key text PRIMARY KEY,
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX api_rate_limits_updated_at_idx ON public.api_rate_limits (updated_at);

CREATE TABLE public.dodo_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  processed boolean NOT NULL DEFAULT false,
  attempts integer NOT NULL DEFAULT 0,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE INDEX dodo_webhook_events_created_idx ON public.dodo_webhook_events (created_at DESC);

CREATE TABLE public.hackathon_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  coupon_code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hackathon_redemptions_owner_idx ON public.hackathon_redemptions (owner);
CREATE INDEX hackathon_redemptions_coupon_idx ON public.hackathon_redemptions (coupon_code);

-- Deny all direct client access by default before selectively permitting
-- owner-scoped read-only entitlements and audit history.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
ALTER TABLE public.usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.github_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.github_app_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.protected_repositories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.protection_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dodo_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hackathon_redemptions ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.usage TO authenticated;
CREATE POLICY usage_select_own ON public.usage FOR SELECT TO authenticated
USING ((SELECT auth.uid()) = owner);

GRANT SELECT ON public.audit_runs TO authenticated;
CREATE POLICY audit_runs_select_own ON public.audit_runs FOR SELECT TO authenticated
USING ((SELECT auth.uid()) = owner);

-- Existing hackathon redemption product flow allows owner-scoped client
-- SELECT/INSERT/DELETE, while disallowing UPDATE.
GRANT SELECT, INSERT, DELETE ON public.hackathon_redemptions TO authenticated;
CREATE POLICY hackathon_redemptions_select_own ON public.hackathon_redemptions FOR SELECT TO authenticated
USING ((SELECT auth.uid()) = owner);
CREATE POLICY hackathon_redemptions_insert_own ON public.hackathon_redemptions FOR INSERT TO authenticated
WITH CHECK ((SELECT auth.uid()) = owner);
CREATE POLICY hackathon_redemptions_delete_own ON public.hackathon_redemptions FOR DELETE TO authenticated
USING ((SELECT auth.uid()) = owner);

-- The user-signup trigger initializes the free entitlement server-side.
-- Ownership is the managed migration role. Never expose direct RPC execute.
CREATE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.usage (owner, scans_used, scans_limit)
  VALUES (NEW.id, 0, 1)
  ON CONFLICT (owner) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL PRIVILEGES ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE FUNCTION public.cleanup_old_audit_runs() RETURNS trigger LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.audit_runs WHERE scanned_at < now() - INTERVAL '90 days';
  RETURN NEW;
END;
$$;
REVOKE ALL PRIVILEGES ON FUNCTION public.cleanup_old_audit_runs() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER audit_runs_retention_trigger AFTER INSERT ON public.audit_runs
FOR EACH STATEMENT EXECUTE FUNCTION public.cleanup_old_audit_runs();

-- Do not copy existing production data or historic migration ledger.
-- Verify RLS grants with PHASE1_READ_ONLY_PRIVILEGE_GATES.sql.check.
