import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { CAPABILITIES } from './agentshield-capabilities.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(dir,'../../..');
const read=file=>readFile(path.join(root,file),'utf8');

test('GitHub token retrieval only uses authenticated server-owned SQL',async()=>{
 const token=await read('artifacts/api-server/src/lib/github.ts');
 const api=await read('artifacts/api-server/src/routes/github.ts');
 assert.match(token,/SELECT encrypted_token FROM public\.github_tokens WHERE owner = \$1 LIMIT 1/);
 assert.match(api,/INSERT INTO public\.github_tokens/);
 assert.match(api,/DELETE FROM public\.github_tokens WHERE owner = \$1/);
 assert.doesNotMatch(token+api,/\/rest\/v1\/github_tokens/);
 assert.doesNotMatch(token+api,/console\.log\([^)]*encrypted_token/);
});
test('GitHub status is authenticated, boolean only and explicitly uncacheable',async()=>{
 const api=await read('artifacts/api-server/src/routes/github.ts');
 assert.match(api,/router\.get\("\/github\/token\/status", requireAuth/);
 assert.match(api,/res\.json\(\{ connected: \(rowCount \?\? 0\) > 0 \}\)/);
 assert.match(api,/Cache-Control", "no-store"/);
 assert.doesNotMatch(api,/res\.json\(\{ encrypted_token/);
});
test('frontend has no direct GitHub token ciphertext table access',async()=>{
 const frontend=await read('artifacts/vibeguard/src/contexts/AuthContext.tsx');
 assert.doesNotMatch(frontend,/\.from\('github_tokens'\)/);
 assert.match(frontend,/\/api\/github\/token\/status/);
 assert.match(frontend,/setHasGithubToken\(null\)/);
 assert.match(frontend,/if \(!response\.ok\) throw new Error\('GitHub disconnection failed'\)/);
});
test('review-only entitlement and token patches are NOT automatic hosted migrations',async()=>{
 const entitlement=await read('supabase/review-only/PROPOSED_USAGE_ENTITLEMENT_LOCKDOWN.sql');
 const token=await read('supabase/review-only/PROPOSED_GITHUB_TOKEN_AUDIT_LOCKDOWN.sql');
 assert.match(entitlement,/REVOKE ALL PRIVILEGES ON TABLE public\.usage/);
 assert.match(token,/REVOKE ALL PRIVILEGES ON TABLE public\.github_tokens/);
 assert.match(token,/REVOKE ALL PRIVILEGES ON TABLE public\.audit_runs/);
 assert.match(token,/NOT a deployable migration/);
});
test('isolated DB fixtures use non-deployable file extensions',async()=>{
 const a=await read('supabase/review-only/test-usage-entitlement-lockdown.sql.fixture');
 const b=await read('supabase/review-only/test-token-audit-lockdown.sql.fixture');
 assert.match(a,/CI_PRIVILEGE_TEST_PASSED/);
 assert.match(b,/CI_TOKEN_AUDIT_LOCKDOWN_PASSED/);
 assert.match(b,/SYNTHETIC_CIPHERTEXT/);
});
test('hybrid exposes bounded cross-file and route-auth analyses only via opt-in AST',async()=>{
 const hybrid=await read('artifacts/api-server/scripts/agentshield-hybrid.mjs');
 const ast=await read('artifacts/api-server/scripts/agentshield-ast.mjs');
 assert.match(hybrid,/enableAst:\s*false/);
 assert.match(hybrid,/ast\.crossFileFindings/);
 assert.match(hybrid,/ast\.routeAuthFindings/);
 assert.match(ast,/analyzeCrossFileSqlFlows/);
 assert.match(ast,/analyzeNextRouteAuth/);
 assert.match(ast,/changed_files_only/);
});
test('scanner runs AST only within separate time-limited worker',async()=>{
 const hybrid=await read('artifacts/api-server/scripts/agentshield-hybrid.mjs');
 assert.match(hybrid,/--max-old-space-size=256/);
 assert.match(hybrid,/timeout:10_000/);
 assert.match(hybrid,/NODE_OPTIONS:''/);
});
test('capability registry excludes nonexistent Python and Java deep SAST',()=>{
 assert.ok(CAPABILITIES.staticScanner.unsupportedDedicatedSast.includes('Python'));
 assert.ok(CAPABILITIES.staticScanner.unsupportedDedicatedSast.includes('Java'));
 assert.equal(CAPABILITIES.securityGuarantee,false);
});
test('production hardening release typechecks are mandatory in CI',async()=>{
 const flow=await read('.github/workflows/agentshield-phase1-phase2.yml');
 assert.match(flow,/Frontend strict typecheck/);
 assert.match(flow,/Backend strict typecheck/);
 assert.match(flow,/token-privilege-proof/);
 assert.doesNotMatch(flow,/continue-on-error:\s*true/);
});
test('real deployment is not performed automatically by the phase workflow',async()=>{
 const flow=await read('.github/workflows/agentshield-phase1-phase2.yml');
 assert.doesNotMatch(flow,/supabase db push|npm publish|render deploy|apply_migration/);
});
