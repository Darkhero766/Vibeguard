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
