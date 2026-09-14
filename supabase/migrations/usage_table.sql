-- VibeGuard / VibeSane — canonical usage schema
--
-- This migration is intentionally additive/idempotent so it can be run against
-- the existing production project without resetting usage or billing data.
-- Production is the current schema baseline; future schema changes must be
-- represented by a new migration rather than silently changing this file.

CREATE TABLE IF NOT EXISTS public.usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scans_used integer NOT NULL DEFAULT 0,
  scans_limit integer NOT NULL DEFAULT 1,
  reset_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT usage_owner_unique UNIQUE (owner)
);

-- Current production quota/billing columns.
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

CREATE POLICY "Users can view their own usage"
  ON public.usage FOR SELECT USING (auth.uid() = owner);
CREATE POLICY "Users can update their own usage"
  ON public.usage FOR UPDATE USING (auth.uid() = owner) WITH CHECK (auth.uid() = owner);
CREATE POLICY "Users can insert their own usage"
  ON public.usage FOR INSERT WITH CHECK (auth.uid() = owner);

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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
