-- VibeGuard / VibeSane — canonical usage schema
-- Production baseline + security/performance hardening.
-- Future schema changes should be new migrations; do not silently rewrite history.

CREATE TABLE IF NOT EXISTS public.usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scans_used integer NOT NULL DEFAULT 0,
  scans_limit integer NOT NULL DEFAULT 1,
  reset_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT usage_owner_unique UNIQUE (owner)
);

ALTER TABLE public.usage ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'free';
ALTER TABLE public.usage ADD COLUMN IF NOT EXISTS pro_expires_at timestamptz;
ALTER TABLE public.usage ADD COLUMN IF NOT EXISTS monthly_scans_used integer NOT NULL DEFAULT 0;
ALTER TABLE public.usage ADD COLUMN IF NOT EXISTS monthly_scans_limit integer NOT NULL DEFAULT 1;
ALTER TABLE public.usage ADD COLUMN IF NOT EXISTS monthly_reset_at timestamptz;
ALTER TABLE public.usage ADD COLUMN IF NOT EXISTS dodo_customer_id text;
ALTER TABLE public.usage ADD COLUMN IF NOT EXISTS dodo_subscription_id text;
ALTER TABLE public.usage ADD COLUMN IF NOT EXISTS dodo_subscription_status text;
ALTER TABLE public.usage ADD COLUMN IF NOT EXISTS pro_source text;
ALTER TABLE public.usage ADD COLUMN IF NOT EXISTS pro_started_at timestamptz;
ALTER TABLE public.usage ADD COLUMN IF NOT EXISTS protected_scans_used integer NOT NULL DEFAULT 0;
ALTER TABLE public.usage ADD COLUMN IF NOT EXISTS public_scans_used integer NOT NULL DEFAULT 0;

ALTER TABLE public.usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own usage" ON public.usage;
DROP POLICY IF EXISTS "Users can update their own usage" ON public.usage;
DROP POLICY IF EXISTS "Users can insert their own usage" ON public.usage;
CREATE POLICY "Users can view their own usage" ON public.usage FOR SELECT USING ((select auth.uid()) = owner);
CREATE POLICY "Users can update their own usage" ON public.usage FOR UPDATE USING ((select auth.uid()) = owner) WITH CHECK ((select auth.uid()) = owner);
CREATE POLICY "Users can insert their own usage" ON public.usage FOR INSERT WITH CHECK ((select auth.uid()) = owner);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.usage (owner, scans_used, scans_limit, monthly_scans_used, monthly_scans_limit, protected_scans_used, public_scans_used)
  VALUES (NEW.id, 0, 1, 0, 1, 0, 0)
  ON CONFLICT (owner) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres, service_role;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Server-only application tables: RLS is enabled intentionally without browser policies.
-- The backend uses its privileged database connection for these operations.
ALTER TABLE public.protected_repositories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.protection_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.github_app_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dodo_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hackathon_redemptions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.protected_repositories ADD COLUMN IF NOT EXISTS owner uuid;
ALTER TABLE public.github_app_installations ADD COLUMN IF NOT EXISTS owner uuid;
ALTER TABLE public.github_tokens ADD COLUMN IF NOT EXISTS owner uuid;
ALTER TABLE public.hackathon_redemptions ADD COLUMN IF NOT EXISTS owner uuid;

CREATE INDEX IF NOT EXISTS protected_repositories_owner_idx ON public.protected_repositories(owner);
CREATE INDEX IF NOT EXISTS protection_events_repo_idx ON public.protection_events(repo);
CREATE INDEX IF NOT EXISTS github_app_installations_owner_idx ON public.github_app_installations(owner);
CREATE INDEX IF NOT EXISTS hackathon_redemptions_owner_idx ON public.hackathon_redemptions(owner);
