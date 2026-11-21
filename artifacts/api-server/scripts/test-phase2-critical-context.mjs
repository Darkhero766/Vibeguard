import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadScanner} from './collect-vibesane-public-evidence.mjs';

const scanner=await loadScanner();
const api=files=>scanner.scanApiFiles(files);
const file=(path,content)=>({path,content});
const rlss=files=>api(files).filter(x=>x.check==='rls');
const service=files=>api(files).filter(x=>x.check==='service_role_client');
const KEY='SUPABASE_'+'SERVICE_ROLE_KEY';

test('CREATE without RLS remains Critical when that is all supplied source shows',()=>{
  const rows=rlss([file('supabase/migrations/001.sql','CREATE TABLE public.orders(id uuid);')]);
  assert.equal(rows.length,1);
  assert.equal(rows[0].severity,'Critical');
  assert.match(rows[0].description,/supplied SQL files/);
});

test('same-file RLS enable is not a surviving RLS warning',()=>{
  assert.equal(rlss([file('supabase/migrations/001.sql',
    'CREATE TABLE public.orders(id uuid);\nALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;')]).length,0);
});

test('later provided migration enabling RLS resolves the earlier snapshot',()=>{
  const rows=rlss([
    file('supabase/migrations/002.sql','ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;'),
    file('supabase/migrations/001.sql','CREATE TABLE public.orders(id uuid);'),
  ]);
  assert.equal(rows.length,0);
});

test('later DROP resolves stale Critical but later CREATE restores it',()=>{
  const files=[
    file('supabase/migrations/001.sql','CREATE TABLE public.orders(id uuid);'),
    file('supabase/migrations/002.sql','DROP TABLE IF EXISTS public.orders CASCADE;'),
  ];
  assert.equal(rlss(files).length,0);
  files.push(file('supabase/migrations/003.sql','CREATE TABLE public.orders(id uuid);'));
  assert.equal(rlss(files).length,1);
});

test('RLS disabled after enable is flagged',()=>{
  assert.equal(rlss([
    file('supabase/migrations/001.sql',
      'CREATE TABLE public.orders(id uuid); ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;'),
    file('supabase/migrations/002.sql','ALTER TABLE public.orders DISABLE ROW LEVEL SECURITY;'),
  ]).length,1);
});

test('unrelated table enable cannot hide missing RLS on another table',()=>{
  const rows=rlss([file('supabase/migrations/001.sql',
    'CREATE TABLE public.orders(id uuid); CREATE TABLE public.users(id uuid); ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;')]);
  assert.equal(rows.length,1);
  assert.match(rows[0].title,/orders/);
});

test('comments cannot masquerade as an ENABLE or DROP migration',()=>{
  const rows=rlss([file('supabase/migrations/001.sql',
    'CREATE TABLE public.orders(id uuid); -- ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;\n/* DROP TABLE public.orders */')]);
  assert.equal(rows.length,1);
});

test('shared util admin helper has High review warning, not fabricated Critical client leak',()=>{
  const got=service([file('utils/supabase-admin.ts','const k=process.env.'+KEY)]);
  assert.equal(got.length,1);
  assert.equal(got[0].severity,'High');
  assert.match(got[0].description,/legitimate server-only/);
});

test('browser-targeted component retains Critical service role warning',()=>{
  const got=service([file('src/components/Checkout.tsx','const k=process.env.'+KEY)]);
  assert.equal(got.length,1);
  assert.equal(got[0].severity,'Critical');
});

test('explicit use-client directive in shared utility retains Critical',()=>{
  const got=service([file('src/utils/Checkout.tsx','"use client";\nconst k=process.env.'+KEY)]);
  assert.equal(got.length,1);
  assert.equal(got[0].severity,'Critical');
});

test('server-only API route does not become client-exposure alert',()=>{
  const got=service([file('pages/api/manage-subscription.ts','const k=process.env.'+KEY)]);
  assert.equal(got.length,0);
});

test('separate monorepo migration roots cannot hide another app missing RLS',()=>{
  const rows=rlss([
    file('apps/alpha/supabase/migrations/001.sql','CREATE TABLE public.orders(id uuid);'),
    file('apps/beta/supabase/migrations/002.sql','ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;'),
  ]);
  assert.equal(rows.length,1);
  assert.equal(rows[0].filePath,'apps/alpha/supabase/migrations/001.sql');
});

test('multi-line SQL comments preserve original finding line positions',()=>{
  const rows=rlss([file('supabase/migrations/001.sql',
    '/* comment\nCREATE TABLE public.fake(id uuid);\n*/\nCREATE TABLE public.orders(id uuid);')]);
  assert.equal(rows.length,1);
  assert.equal(rows[0].line,4);
});

const rpc=files=>api(files).filter(x=>x.check==='unprotected_rpc');
const privilege=files=>api(files).filter(x=>x.check==='role_self_promotion');

test('schema-qualified unguarded definer reports actual function name',()=>{
  const f=rpc([file('supabase/migrations/001.sql',
    'CREATE FUNCTION public.open_private_data() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN RETURN null; END; $$;')]);
  assert.equal(f.length,1);
  assert.match(f[0].title,/open_private_data/);
  assert.doesNotMatch(f[0].title,/function "public"/);
});

test('admin guards do not leak from one function into its neighbor',()=>{
  const sql=[
    "CREATE FUNCTION public.is_platform_admin() RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='admin'); $$;",
    "CREATE FUNCTION public.platform_admin_overview() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Forbidden'; END IF; RETURN null; END; $$;",
    "CREATE FUNCTION public.open_private_data() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN RETURN null; END; $$;",
  ].join('\n');
  const f=rpc([file('supabase/migrations/001.sql',sql)]);
  assert.equal(f.length,1);
  assert.match(f[0].title,/open_private_data/);
});

test('trigger-only SECURITY DEFINER is not called an exposed RPC',()=>{
  const sql='CREATE FUNCTION public.on_auth_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN RETURN new; END; $$;';
  assert.equal(rpc([file('supabase/migrations/001.sql',sql)]).length,0);
});

test('role self-promotion is detected when source evidence aligns',()=>{
  const sql=[
    'CREATE POLICY profiles_self_update ON public.profiles FOR UPDATE USING (id=auth.uid()) WITH CHECK (id=auth.uid());',
    'GRANT UPDATE ON public.profiles TO authenticated;',
    "CREATE FUNCTION public.is_platform_admin() RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='admin'); $$;",
  ].join('\n');
  const f=privilege([file('supabase/migrations/001.sql',sql)]);
  assert.equal(f.length,1);
  assert.equal(f[0].line,2);
  assert.equal(f[0].severity,'High');
});

test('column-only grants and effective role check or revoke are not incorrectly escalated',()=>{
  const policy='CREATE POLICY profiles_self_update ON public.profiles FOR UPDATE USING (id=auth.uid()) WITH CHECK (id=auth.uid());';
  const safe='CREATE POLICY profiles_self_update ON public.profiles FOR UPDATE USING (id=auth.uid()) WITH CHECK (id=auth.uid() AND role <> \'admin\');';
  const helper="CREATE FUNCTION public.is_platform_admin() RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT role='admin' FROM public.profiles WHERE id=auth.uid(); $$;";
  for(const sql of [
    [policy,'GRANT UPDATE (name,email) ON public.profiles TO authenticated;',helper].join('\n'),
    [safe,'GRANT UPDATE ON public.profiles TO authenticated;',helper].join('\n'),
    [policy,'GRANT UPDATE ON public.profiles TO authenticated;','REVOKE UPDATE ON public.profiles FROM authenticated;',helper].join('\n'),
  ]) assert.equal(privilege([file('supabase/migrations/001.sql',sql)]).length,0);
});

test('different projects cannot combine migration evidence into an escalation',()=>{
  const f=privilege([
    file('apps/a/supabase/migrations/001.sql','CREATE POLICY owner ON public.profiles FOR UPDATE USING (id=auth.uid()) WITH CHECK (id=auth.uid());'),
    file('apps/b/supabase/migrations/001.sql',"GRANT UPDATE ON public.profiles TO authenticated; CREATE FUNCTION public.is_platform_admin() RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT role='admin' FROM public.profiles; $$;"),
  ]);
  assert.equal(f.length,0);
});

test('auth.uid bound to a local UUID and rejected when null is an authentication guard',()=>{
  const sql=[
    'CREATE FUNCTION public.uid_guarded() RETURNS jsonb',
    'LANGUAGE plpgsql SECURITY DEFINER AS $$',
    'DECLARE current_id uuid := auth.uid();',
    'BEGIN',
    "IF current_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;",
    "RETURN '{}'::jsonb;",
    'END; $$;',
  ].join('\n');
  assert.equal(rpc([file('supabase/migrations/014.sql',sql)]).length,0);
});

test('cross-owner recovery produces a precise security review, not a false missing-auth finding',()=>{
  const sql=[
    'CREATE FUNCTION public.recover_same_email_tenant() RETURNS jsonb',
    'LANGUAGE plpgsql SECURITY DEFINER AS $$',
    'DECLARE current_id uuid := auth.uid(); source_id uuid;',
    'BEGIN',
    "IF current_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;",
    "SELECT p.id INTO source_id FROM public.profiles p WHERE lower(p.email) = 'example.invalid' LIMIT 1;",
    'UPDATE public.sales SET owner_id=current_id WHERE owner_id=source_id;',
    "RETURN '{}'::jsonb;",
    'END; $$;',
  ].join('\n');
  const findings=api([file('supabase/migrations/014.sql',sql)]);
  assert.equal(findings.filter(f=>f.check==='unprotected_rpc').length,0);
  const recovery=findings.filter(f=>f.check==='privileged_account_recovery');
  assert.equal(recovery.length,1);
  assert.equal(recovery[0].severity,'High');
  assert.match(recovery[0].description,/not proof of exploitability/);
});
