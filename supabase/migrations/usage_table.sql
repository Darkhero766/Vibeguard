-- VibeGuard — usage table migration
-- Run this in your Supabase SQL Editor:
-- Dashboard → SQL Editor → paste → Run
--
-- Creates the per-user scan-limit table, enables RLS, and installs a
-- trigger that auto-creates a usage row whenever a new user signs up.

-- 1. Table
CREATE TABLE IF NOT EXISTS public.usage (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scans_used  integer     NOT NULL DEFAULT 0,
  scans_limit integer     NOT NULL DEFAULT 1,
  reset_at    timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT usage_owner_unique UNIQUE (owner)
);

-- 2. Row-Level Security
ALTER TABLE public.usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own usage"   ON public.usage;
DROP POLICY IF EXISTS "Users can update their own usage" ON public.usage;
DROP POLICY IF EXISTS "Users can insert their own usage" ON public.usage;

CREATE POLICY "Users can view their own usage"
  ON public.usage FOR SELECT
  USING (auth.uid() = owner);

CREATE POLICY "Users can update their own usage"
  ON public.usage FOR UPDATE
  USING (auth.uid() = owner)
  WITH CHECK (auth.uid() = owner);

-- Allows the frontend to self-create a row for users who signed up
-- before this trigger was installed.
CREATE POLICY "Users can insert their own usage"
  ON public.usage FOR INSERT
  WITH CHECK (auth.uid() = owner);

-- 3. Auto-create usage row on every new signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.usage (owner, scans_used, scans_limit)
  VALUES (NEW.id, 0, 1)
  ON CONFLICT (owner) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
