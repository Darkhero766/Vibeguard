// Versioned synthetic, individually labeled security-accuracy corpus.
// Labels express expected detector behavior, not proven exploitable flaws.
// No real API keys, passwords, source repositories, or customer data.
const tick = String.fromCharCode(96);
const expr = '$' + '{userId}';
const jwt = 'Z'.repeat(36);
const gh = 'T'.repeat(36);
const google = 'Q'.repeat(35);
const longPass = 'FAKE_DEMO_ONLY_234567890';
const g = (name, ruleId, positives, negatives, file = 'src/example.ts') => ({
  name, ruleId, positives, negatives, file,
});
const groups = [
  g('hardcoded_jwt', 'hardcoded_jwt_secret', [
    'const JWT_SECRET = "' + jwt + '";',
    "export const JWT_SIGNING_KEY = '" + jwt + "';",
    'const jwtSecret: string = "' + jwt + '";',
    'const cfg = { JWT_SECRET: "' + jwt + '" };',
    'let JWT_SECRET = "' + jwt + '";',
  ], [
    'const JWT_SECRET = process.env.JWT_SECRET;',
    'const JWT_SIGNING_KEY = readSecret("JWT_SIGNING_KEY");',
    'const jwtSecret = getRuntimeSigningKey();',
    'const JWT_SECRET = "SHORT";',
    '// JWT_SECRET = "' + jwt + '"',
  ]),
  g('github_tokens', 'github_token', [
    'const token = "ghp_' + gh + '";',
    'export const token = "gho_' + gh + '";',
    'const token = "ghu_' + gh + '";',
    'const token = "ghs_' + gh + '";',
    'const token = "ghr_' + gh + '";',
  ], [
    'const token = process.env.GITHUB_TOKEN;',
    'const token = "ghp_demo";',
    'const prefix = "ghp_";',
    'const help = "Set GITHUB_TOKEN";',
    '// token = "ghp_' + gh + '";',
  ]),
  g('unsafe_sql_templates', 'unsafe_sql_template', [
    'db.query(' + tick + 'SELECT * FROM users WHERE id = ' + expr + tick + ');',
    'pool.query(' + tick + 'UPDATE users SET name = ' + expr + tick + ');',
    'conn.execute(' + tick + 'DELETE FROM users WHERE id=' + expr + tick + ');',
    'db.query(' + tick + 'INSERT INTO users (id) VALUES (' + expr + ')' + tick + ');',
    'await db.query(' + tick + 'SELECT id FROM users WHERE id=' + expr + ' LIMIT 1' + tick + ');',
  ], [
    'db.query("SELECT * FROM users WHERE id = $1", [userId]);',
    'db.query("UPDATE users SET name = $1 WHERE id = $2", [name, userId]);',
    'db.execute("DELETE FROM users WHERE id = ?", [userId]);',
    'await db.query("INSERT INTO users (id) VALUES ($1)", [userId]);',
    'const sql = "SELECT * FROM users WHERE id = $1"; db.query(sql, [userId]);',
  ]),
  g('missing_api_auth', 'unauthenticated_write', [
    "export async function POST() { return supabase.from('orders').insert({total:1}); }",
    "export async function PATCH() { await supabase.from('orders').update({total:1}); }",
    "export async function DELETE() { await supabase.from('orders').delete().eq('id', id); }",
    "export async function PUT() { await supabase.from('orders').upsert({id:1}); }",
    "export async function POST(request) { const json=await request.json(); await supabase.from('orders').insert(json); }",
  ], [
    "export async function POST() { const u = await auth.getUser(); if(!u) throw Error('unauthorized'); return supabase.from('orders').insert({total:1}); }",
    "export async function POST() { const s = await getServerSession(); if(!s) return; await supabase.from('orders').insert({total:1}); }",
    "export async function PATCH() { const u = session.user; if(!u) throw Error('unauthorized'); await supabase.from('orders').update({id:1}); }",
    "export async function POST() { const u = await requireAuth(); if(!u) throw Error('unauthorized'); await supabase.from('orders').insert({total:1}); }",
    "export async function DELETE() { const u = await requireUser(); if(!u) return; await supabase.from('orders').delete(); }",
  ], 'app/api/benchmark/route.ts'),
  g('service_role_client', 'service_role_client', [
    'const supabase = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY);',
    'const secret = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;',
    "const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');",
    'const secret = process.env.CUSTOM_SERVICE_ROLE_KEY;',
    'const secret = import.meta.env.CUSTOM_SERVICE_ROLE_KEY;',
  ], [
    'const secret = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;',
    'const secret = process.env.SUPABASE_URL;',
    'const client = createClient(url, process.env.SUPABASE_ANON_KEY);',
    'const access = await loadPublicSession();',
    'const key = getServerSideCredential();',
  ]),
  g('rls_missing', 'rls', [
    'CREATE TABLE public.notes (id uuid PRIMARY KEY);',
    'CREATE TABLE public.invoices (id bigint PRIMARY KEY);',
    'CREATE TABLE public.profiles (id int);',
    'CREATE TABLE public.todo_items (id text);',
    'CREATE TABLE public.audit_events (id bigint);',
  ], [
    'CREATE TABLE public.notes (id uuid); ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;',
    'CREATE TABLE public.invoices (id bigint); ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;',
    'CREATE TABLE public.profiles (id int); ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;',
    'CREATE TABLE public.todo_items (id text); ALTER TABLE public.todo_items ENABLE ROW LEVEL SECURITY;',
    'CREATE TABLE public.audit_events (id bigint); ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;',
  ], 'migrations/001.sql'),
  g('rls_policy_missing', 'rls_policy_missing', [
    'CREATE TABLE public.notes (id uuid); ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;',
    'CREATE TABLE public.invoices (id bigint); ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;',
    'CREATE TABLE public.profiles (id int); ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;',
    'CREATE TABLE public.todo_items (id text); ALTER TABLE public.todo_items ENABLE ROW LEVEL SECURITY;',
    'CREATE TABLE public.audit_events (id bigint); ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;',
  ], [
    'CREATE TABLE public.notes (id uuid); ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY; CREATE POLICY "owner" ON public.notes USING (auth.uid() = id);',
    'CREATE TABLE public.invoices (id bigint); ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY; CREATE POLICY "owner" ON public.invoices USING (auth.uid() IS NOT NULL);',
    'CREATE TABLE public.profiles (id int); ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY; CREATE POLICY "owner" ON public.profiles USING (auth.uid() IS NOT NULL);',
    'CREATE TABLE public.todo_items (id text); ALTER TABLE public.todo_items ENABLE ROW LEVEL SECURITY; CREATE POLICY "owner" ON public.todo_items USING (auth.uid() IS NOT NULL);',
    'CREATE TABLE public.audit_events (id bigint); ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY; CREATE POLICY "owner" ON public.audit_events USING (auth.uid() IS NOT NULL);',
  ], 'migrations/001.sql'),
  g('hardcoded_password', 'hardcoded_password', [
    'const password = "' + longPass + '";',
    'const passwd = "' + longPass + '";',
    'const pwd = "' + longPass + '";',
    "const options = { password: '" + longPass + "' };",
    'let userPassword = "' + longPass + '";',
  ], [
    'const password = process.env.PASSWORD;',
    'const password = await getPassword();',
    'const passwd = prompt("Password");',
    'const pwd = "short";',
    '// password = "' + longPass + '";',
  ]),
  g('xss_innerhtml', 'innerhtml_assignment', [
    'document.querySelector("#x").innerHTML = input;',
    'element.innerHTML = location.hash;',
    'target.innerHTML = response.data;',
    'node.innerHTML = userProvidedHtml;',
    'root.innerHTML = template;',
  ], [
    'document.querySelector("#x").textContent = input;',
    'element.textContent = location.hash;',
    'target.appendChild(document.createTextNode(input));',
    'const value = escapeHtml(input);',
    '// element.innerHTML = userProvidedHtml;',
  ]),
  g('weak_random_security', 'weak_random', [
    'const resetToken = Math.random();',
    'const authNonce = Math.random();',
    'const sessionKey = Math.random();',
    'const otpCode = Math.random();',
    'const csrfSecret = Math.random();',
  ], [
    'const resetToken = crypto.randomUUID();',
    'const authNonce = crypto.getRandomValues(new Uint8Array(16));',
    'const otpCode = crypto.randomInt(0,9999);',
    'const imageWidth = Math.random();',
    'const diceValue = Math.random();',
  ]),
  g('google_api_key', 'google_api_key', [
    'const key = "AIza' + google + '";',
    'const apiKey = "AIza' + 'B'.repeat(35) + '";',
    'const googleKey = "AIza' + 'C'.repeat(35) + '";',
    'const token = "AIza' + 'D'.repeat(35) + '";',
    'const config = { key: "AIza' + 'E'.repeat(35) + '" };',
  ], [
    'const key = process.env.GOOGLE_API_KEY;',
    'const key = "AIza_short";',
    'const key = "AIzz' + google + '";',
    'const key = getGoogleApiKey();',
    '// key = "AIza' + google + '";',
  ]),
  g('sql_grant_public', 'sql_grant_public', [
    'GRANT SELECT ON public.notes TO PUBLIC;',
    'GRANT INSERT ON public.events TO PUBLIC;',
    'GRANT ALL ON public.users TO PUBLIC;',
    'GRANT UPDATE ON public.todos TO PUBLIC;',
    'GRANT DELETE ON public.logs TO PUBLIC;',
  ], [
    'REVOKE SELECT ON public.notes FROM PUBLIC;',
    'GRANT SELECT ON public.notes TO authenticated;',
    'GRANT UPDATE ON public.notes TO app_user;',
    '-- GRANT SELECT ON public.notes TO PUBLIC;',
    'GRANT USAGE ON SCHEMA public TO app_user;',
  ], 'migrations/002.sql'),
];
export const BENCHMARK_CASES = groups.flatMap(group => [
  ...group.positives.map((content, index) => ({
    id: group.name + '_positive_' + (index + 1), category: group.name, ruleId: group.ruleId,
    expected: true, path: group.file, content, rationale: 'Synthetic supported risky pattern for ' + group.ruleId,
  })),
  ...group.negatives.map((content, index) => ({
    id: group.name + '_negative_' + (index + 1), category: group.name, ruleId: group.ruleId,
    expected: false, path: group.file, content, rationale: 'Synthetic benign or protected counterexample for ' + group.ruleId,
  })),
]);
