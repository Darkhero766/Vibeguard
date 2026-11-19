// Challenge corpus was authored separately from the 120-case tuning corpus.
// These are synthetic expectations, not exploit proofs. Intentional blind spots
// remain in the results and must not be silently relabeled or excluded.
const bt = String.fromCharCode(96);
const interpolate = '$' + '{userId}';
const secret = 'N'.repeat(38);
const group = (category, ruleId, cases) => cases.map(([suffix, expected, path, content, rationale]) => ({
  id: category + '_' + suffix, category, ruleId, expected, path, content, rationale,
}));
export const HOLDOUT_CASES = [
  ...group('jwt_challenge', 'hardcoded_jwt_secret', [
    ['typed_generic', true, 'src/auth.ts', 'const jwtSecret: Readonly<string> = "' + secret + '";', 'Typed literal signing secret is risky even with generic annotation.'],
    ['literal', true, 'src/auth.ts', 'export const JWT_SIGNING_KEY = "' + secret + '";', 'Long literal signing secret.'],
    ['env', false, 'src/auth.ts', 'const jwtSecret = process.env.JWT_SECRET;', 'Environment-backed key reference, not literal.'],
    ['comment', false, 'src/auth.ts', '// JWT_SECRET = "' + secret + '";', 'Comment-only example is not executed.'],
  ]),
  ...group('sql_challenge', 'unsafe_sql_template', [
    ['string_concat', true, 'src/db.ts', "await db.query('SELECT * FROM users WHERE id=' + userId);", 'Dynamic SQL concatenation is risky; current heuristic may miss it.'],
    ['interpolated', true, 'src/db.ts', 'await pool.query(' + bt + 'SELECT * FROM users WHERE id=' + interpolate + bt + ');', 'Interpolated dynamic SQL.'],
    ['parameterized', false, 'src/db.ts', 'await db.query("SELECT * FROM users WHERE id=$1", [userId]);', 'Bind parameters separate code and input.'],
    ['prepared', false, 'src/db.ts', 'await db.execute("SELECT * FROM users WHERE id=?", [userId]);', 'Positional bind in prepared statement.'],
  ]),
  ...group('auth_challenge', 'unauthenticated_write', [
    ['comment_only', true, 'app/api/orders/route.ts', "// const u = await auth.getUser();\nexport async function POST(){await db.from('orders').insert({total:1});}", 'Commented guard is not authorization.'],
    ['no_guard', true, 'app/api/orders/route.ts', "export async function POST(){await db.from('orders').update({total:1});}", 'No visible authentication before write.'],
    ['explicit_guard', false, 'app/api/orders/route.ts', "export async function POST(){const u=await requireUser(); if(!u) return; await db.from('orders').update({total:1});}", 'Recognized checked guard.'],
    ['custom_guard', false, 'app/api/orders/route.ts', "export async function POST(request){const u=await authorizeRequest(request); if(!u) return; await db.from('orders').update({total:1});}", 'Application-specific checked auth function may be a detector FP; manual review required.'],
  ]),
  ...group('service_challenge', 'service_role_client', [
    ['browser_global', true, 'src/browser.ts', 'const key = window.__ENV.SUPABASE_SERVICE_ROLE_KEY;', 'Privileged key in a browser-accessible runtime object.'],
    ['import_meta', true, 'src/page.ts', 'const key = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;', 'Privileged key in browser bundle.'],
    ['server_scoped', false, 'src/server/db.ts', 'const key = process.env.SUPABASE_SERVICE_ROLE_KEY;', 'Server-only code can use privileged configuration with correct authorization.'],
    ['anon_key', false, 'src/page.ts', 'const key = process.env.SUPABASE_ANON_KEY;', 'Anon/public key is distinct from service-role credential.'],
  ]),
  ...group('environment_challenge', 'committed_env_file', [
    ['staging', true, '.env.staging', 'EXAMPLE_TOKEN=synthetic_value_only', 'Staging env file should receive committed-env warning.'],
    ['local', true, '.env.local', 'DEMO_FLAG=1', 'Local env file committed to code.'],
    ['example', false, '.env.example', 'DEMO_FLAG=placeholder', 'Example template without credentials.'],
    ['template', false, '.env.template', 'DEMO_FLAG=placeholder', 'Template placeholder.'],
  ]),
  ...group('rls_challenge', 'rls', [
    ['plain', true, 'migrations/001.sql', 'CREATE TABLE public.receipts (id uuid primary key);', 'Migration has no visible RLS enablement.'],
    ['quoted', true, 'migrations/001.sql', 'CREATE TABLE "public"."reports" (id uuid PRIMARY KEY);', 'Quoted SQL identifiers are valid; heuristic may miss them.'],
    ['enabled', false, 'migrations/001.sql', 'CREATE TABLE public.receipts(id uuid); ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;', 'RLS explicitly enabled.'],
    ['enabled_policy', false, 'migrations/001.sql', 'CREATE TABLE public.reports(id uuid); ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY; CREATE POLICY p ON public.reports USING (true);', 'RLS enabled; policy breadth is a separate check.'],
  ]),
];
