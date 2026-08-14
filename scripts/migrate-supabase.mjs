/**
 * Runs the VibeGuard Supabase schema migration.
 * Usage: node scripts/migrate-supabase.mjs
 */
import pg from 'pg';

const { Client } = pg;
const rawUrl = process.env.SUPABASE_DB_URL;
if (!rawUrl) {
  console.error('SUPABASE_DB_URL is not set');
  process.exit(1);
}

const url = rawUrl.endsWith('/') ? `${rawUrl}postgres` : rawUrl;
const ca = process.env.SUPABASE_DB_CA?.replace(/\\n/g, '\n');

const client = new Client({
  connectionString: url,
  ssl: { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
});

const SQL = `
-- GitHub OAuth tokens (encrypted server-side)
CREATE TABLE IF NOT EXISTS public.github_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  encrypted_token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT github_tokens_owner_unique UNIQUE (owner)
);

ALTER TABLE public.github_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own github token" ON public.github_tokens;
CREATE POLICY "Users can manage their own github token"
  ON public.github_tokens FOR ALL
  USING (auth.uid() = owner)
  WITH CHECK (auth.uid() = owner);

CREATE TABLE IF NOT EXISTS public.usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scans_used integer NOT NULL DEFAULT 0,
  scans_limit integer NOT NULL DEFAULT 1,
  reset_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT usage_owner_unique UNIQUE (owner)
);

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
`;

async function main() {
  console.log('Connecting to Supabase...');
  try {
    await client.connect();
    console.log('Connected. Running migration...');
    await client.query(SQL);
    console.log('Migration complete.');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
