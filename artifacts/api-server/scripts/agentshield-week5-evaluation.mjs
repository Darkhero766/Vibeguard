// Week 5 new synthetic Next.js/Supabase evaluation cases; these were not used
// to tune the Week 4 scanner. Individual target-rule labels are review judgments,
// NOT verified exploitability. Report all misses rather than retuning this set.
const tick = String.fromCharCode(96);
const interp = '$' + '{ownerId}';
const secret = 'M'.repeat(36);
const group = (name, ruleId, path, risky, safe) => [
  ...risky.map((content, i) => ({ id:name+'-risk-'+(i+1), category:name, ruleId,
    path, content, expected:true, rationale:'Synthetic suspected risk in '+name })),
  ...safe.map((content, i) => ({ id:name+'-control-'+(i+1), category:name, ruleId,
    path, content, expected:false, rationale:'Synthetic control case in '+name })),
];
export const WEEK5_EVALUATION = [
  ...group('nextjs_auth', 'unauthenticated_write', 'app/api/orders/route.ts', [
    'export async function POST(r){ const body=await r.json(); await db.from("orders").insert(body); }',
    'export async function PATCH(r){ await db.from("orders").update({status:"paid"}); }',
    '// auth.getUser();\nexport async function POST(){return db.from("orders").insert({x:1});}',
    'export async function DELETE(){return db.from("orders").delete();}',
  ], [
    'export async function POST(){ const user=await auth.getUser(); if(!user) return; return db.from("orders").insert({x:1});}',
    'export async function POST(){ const s=await getServerSession(); if(!s) return; return db.from("orders").insert({x:1});}',
    'export async function PATCH(){const u=await requireUser();if(!u) return;await db.from("orders").update({x:1});}',
    'export async function POST(r){const u=await verifySession(r);if(!u) return;return db.from("orders").insert({x:1});}',
  ]),
  ...group('supabase_client', 'service_role_client', 'src/ui/App.tsx', [
    'const supabase = createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY);',
    'const secret=import.meta.env.SUPABASE_SERVICE_ROLE_KEY;',
    'const key=window.__ENV.SUPABASE_SERVICE_ROLE_KEY;',
    'const key=globalThis.__ENV.SUPABASE_SERVICE_ROLE_KEY;',
  ], [
    'const key=import.meta.env.VITE_SUPABASE_ANON_KEY;',
    'const supabase=createClient(url,process.env.SUPABASE_ANON_KEY);',
    'const baseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL;',
    'const key=window.__ENV.SUPABASE_ANON_KEY;',
  ]),
  ...group('rls', 'rls', 'supabase/migrations/001.sql', [
    'CREATE TABLE public.orders(id uuid PRIMARY KEY);',
    'CREATE TABLE "public"."invoices"(id uuid PRIMARY KEY);',
    'CREATE TABLE public.private_messages(id uuid PRIMARY KEY);',
    'CREATE TABLE public.accounts(id uuid PRIMARY KEY);',
  ], [
    'CREATE TABLE public.orders(id uuid); ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;',
    'CREATE TABLE "public"."invoices"(id uuid); ALTER TABLE "public"."invoices" ENABLE ROW LEVEL SECURITY;',
    'CREATE TABLE public.private_messages(id uuid); ALTER TABLE public.private_messages ENABLE ROW LEVEL SECURITY;',
    'CREATE TABLE public.accounts(id uuid); ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;',
  ]),
  ...group('sql', 'unsafe_sql_template', 'src/server/repository.ts', [
    'db.query('+tick+'SELECT * FROM orders WHERE owner_id='+interp+tick+');',
    'pool.query('+tick+'UPDATE orders SET status=1 WHERE owner_id='+interp+tick+');',
    'db.query("SELECT * FROM orders WHERE id=" + orderId);',
    'pool.execute("DELETE FROM orders WHERE id=" + orderId);',
  ], [
    'db.query("SELECT * FROM orders WHERE owner_id=$1", [ownerId]);',
    'pool.query("UPDATE orders SET status=1 WHERE owner_id=$1", [ownerId]);',
    'db.execute("DELETE FROM orders WHERE id=?", [orderId]);',
    'await prisma.orders.findUnique({where:{id:orderId}});',
  ]),
  ...group('jwt', 'hardcoded_jwt_secret', 'src/server/session.ts', [
    'const JWT_SECRET="'+secret+'";',
    'const jwtSecret: string = "'+secret+'";',
    'const JWT_SIGNING_KEY="'+secret+'";',
    'const jwtSecret: Readonly<string> = "'+secret+'";',
  ], [
    'const JWT_SECRET=process.env.JWT_SECRET;',
    'const jwtSecret=loadSecret("JWT_SECRET");',
    'const JWT_SIGNING_KEY=readRuntimeConfig();',
    'const jwtSecret: string = process.env.JWT_SECRET;',
  ]),
  ...group('env', 'committed_env_file', '.env.staging', [
    'DB_NAME=sandbox',
    'DB_PASSWORD=FAKE_DEMO_ONLY',
    'TOKEN=not-a-real-token',
    'API_URL=http://localhost',
  ], [
    // Different negative path is supplied below for this category.
  ]).map(x => x.expected ? x : { ...x, path:'.env.example' }),
  ...group('env_controls', 'committed_env_file', '.env.example', [], [
    'DB_NAME=placeholder',
    'TOKEN=example',
    'DB_PASSWORD=your_password',
    'API_URL=http://localhost',
  ]),
];
