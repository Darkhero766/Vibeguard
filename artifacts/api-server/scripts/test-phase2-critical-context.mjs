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

test('authenticated SECURITY DEFINER cannot grant Pro to arbitrary caller target',()=>{
  const sql=[
    'CREATE FUNCTION public.debug_pro(p_target_user uuid) RETURNS void',
    'LANGUAGE plpgsql SECURITY DEFINER AS $$',
    'DECLARE current_user_id uuid := auth.uid();',
    'BEGIN',
    "IF current_user_id IS NULL THEN RAISE EXCEPTION 'login required'; END IF;",
    "UPDATE public.usage SET plan='pro', scans_limit=999 WHERE owner=p_target_user;",
    'END; $$;',
  ].join('\n');
  const found=api([file('supabase/migrations/024.sql',sql)])
    .filter(f=>f.check==='privileged_entitlement_write');
  assert.equal(found.length,1);
  assert.equal(found[0].severity,'High');
  assert.match(found[0].description,/EXECUTE grants/);
});

test('owner-bound and admin-guarded Pro changes are not fabricated vulnerabilities',()=>{
  const start=[
    'CREATE FUNCTION public.change_subscription(p_target_user uuid) RETURNS void',
    'LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN',
  ];
  const scenarios=[
    ["IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Auth required'; END IF;","UPDATE public.usage SET plan='pro' WHERE owner=auth.uid();"],
    ["IF p_target_user <> auth.uid() THEN RAISE EXCEPTION 'Forbidden'; END IF;","UPDATE public.usage SET plan='pro' WHERE owner=p_target_user;"],
    ["IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Forbidden'; END IF;","UPDATE public.usage SET plan='pro' WHERE owner=p_target_user;"],
    ["IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Auth required'; END IF;","UPDATE public.usage SET plan='free' WHERE owner=p_target_user;"],
  ];
  for(const statements of scenarios){
    const sql=[...start,...statements,'END; $$;'].join('\n');
    assert.equal(api([file('supabase/migrations/024.sql',sql)])
      .filter(f=>f.check==='privileged_entitlement_write').length,0);
  }
});

test('pinned source-style Next.js role guard is a Medium review lead, not proven missing auth',()=>{
  const files=[
    file('src/app/api/account/api-keys/[id]/route.ts',[
      "import { requireRole, toErrorResponse } from '@/lib/auth/account';",
      'export async function DELETE(_request: Request, { params }: any) {',
      "  const ctx = await requireRole('admin');",
      "  return ctx.supabase.from('api_keys').update({revoked_at:new Date().toISOString()}).eq('account_id',ctx.accountId);",
      '}',
    ].join('\n')),
    file('src/app/api/ai/autoreply/[conversationId]/route.ts',[
      "import { requireRole } from '@/lib/auth/account';",
      'export async function POST(request: Request) {',
      "  const { supabase, accountId } = await requireRole('agent');",
      "  return supabase.from('conversations').update({ai_autoreply_disabled:true}).eq('account_id',accountId);",
      '}',
    ].join('\n')),
  ];
  for(const target of files){
    const findings=api([target]).filter(f=>f.check==='unauthenticated_write');
    assert.equal(findings.length,1);
    assert.equal(findings[0].severity,'Medium');
    assert.match(findings[0].description,/manual review/);
  }
});

test('unrelated, unawaited and cross-handler role helpers do not mask unguarded writes',()=>{
  const examples=[
    [
      "import { requireRole } from './fake-auth';",
      'export async function POST(){await requireRole("admin");await db.from("customers").insert({});}',
    ],
    [
      "import { requireRole } from '@/lib/auth/account';",
      'export async function POST(){requireRole("admin");await db.from("customers").insert({});}',
    ],
    [
      "import { requireRole } from '@/lib/auth/account';",
      'export async function GET(){await requireRole("admin");return new Response("ok");}',
      'export async function POST(){await db.from("customers").insert({});}',
    ],
  ];
  for(const pieces of examples){
    const findings=api([file('app/api/test/route.ts',pieces.join('\n'))])
      .filter(f=>f.check==='unauthenticated_write');
    assert.equal(findings.length,1);
    assert.equal(findings[0].severity,'High');
  }
});


test('higher-order Stripe webhook route wrapper retains signature context before DB write',()=>{
  const src=[
    "const checkoutSessionMap = new Map<string, unknown>();",
    'export const POST=withCors(async function POST(request:NextRequest){',
    "const sig=request.headers.get('stripe-signature');",
    "const event=stripe.webhooks.constructEvent(await request.text(),sig,webhookSecret);",
    "checkoutSessionMap.delete(event.id);",
    "await supabase.from('subscriptions').update({status:'active'}).eq('id',event.id);",
    '});',
  ].join('\n');
  const findings=api([file('app/api/stripe/webhook/route.ts',src)])
    .filter(f=>f.check==='unauthenticated_write');
  assert.equal(findings.length,1);
  assert.equal(findings[0].line,6,'Map.delete must not be treated as first database write');
  assert.equal(findings[0].severity,'Medium');
});

test('in-memory Map.delete in Stripe webhook is not an unguarded database write',()=>{
  const src=[
    "const checkoutSessionMap = new Map<string, unknown>();",
    'export async function POST(request: Request) {',
    "  const sig=request.headers.get('stripe-signature');",
    '  const event=stripe.webhooks.constructEvent(await request.text(),sig,webhookSecret);',
    '  checkoutSessionMap.delete(event.id);',
    '}',
  ].join('\n');
  assert.equal(api([file('app/api/stripe/webhook/route.ts',src)])
    .filter(f=>f.check==='unauthenticated_write').length,0);
});

test('signed Stripe webhook database mutations retain contextual Medium review, not missing-login High',()=>{
  const src=[
    "import { stripe } from '@/lib/stripe';",
    'export async function POST(request: Request) {',
    "  const sig=request.headers.get('Stripe-Signature');",
    '  const event=stripe.webhooks.constructEvent(await request.text(),sig,webhookSecret);',
    "  await db.user.update({where:{id:event.data.object.id},data:{plan:'pro'}});",
    '}',
  ].join('\n');
  const findings=api([file('app/api/webhooks/stripe/route.ts',src)])
    .filter(f=>f.check==='unauthenticated_write');
  assert.equal(findings.length,1);
  assert.equal(findings[0].severity,'Medium');
  assert.match(findings[0].description,/invalid signatures abort/);
});

test('unsigned or late-verified Stripe webhook writes remain High',()=>{
  const unsigned=[
    'export async function POST(request:Request){',
    "await db.user.update({where:{id:'a'},data:{plan:'pro'}});",
    '}',
  ].join('\n');
  const late=[
    'export async function POST(request:Request){',
    "await db.user.update({where:{id:'a'},data:{plan:'pro'}});",
    'stripe.webhooks.constructEvent(raw,sig,secret);',
    '}',
  ].join('\n');
  const noVerifier="const docs='stripe.webhooks.constructEvent(raw,sig,secret)';\n"+unsigned;
  for(const source of [unsigned,late,noVerifier]){
    const findings=api([file('app/api/webhooks/stripe/route.ts',source)])
      .filter(f=>f.check==='unauthenticated_write');
    assert.equal(findings.length,1);
    assert.equal(findings[0].severity,'High');
  }
});
