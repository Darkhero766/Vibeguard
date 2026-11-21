import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (name) => readFile(path.join(root, name), 'utf8');

test('GitHub OAuth handoff never awaits Supabase calls inside onAuthStateChange', async () => {
  const source = await read('artifacts/vibeguard/src/contexts/AuthContext.tsx');
  assert.match(source, /supabase\.auth\.onAuthStateChange\(\(_event, s\) => \{/);
  assert.doesNotMatch(source, /supabase\.auth\.onAuthStateChange\(\s*async\s*\(/);
  assert.match(source, /setTimeout\(\(\) => \{/);
  assert.match(source, /const githubProviderToken = s\.provider_token;/);
  assert.match(source, /const userAccessToken = s\.access_token;/);
  assert.match(source, /fetch\(apiUrl\('\/api\/github\/token'\)/);
  assert.match(source, /if \(!response\.ok\)/);
  assert.match(source, /setHasGithubToken\(true\)/);
  assert.doesNotMatch(source, /localStorage\.setItem\([^)]*provider_token/);
  assert.doesNotMatch(source, /console\.(?:log|warn|error)\([^)]*(?:githubProviderToken|s\.provider_token)/);
});

test('GitHub provider token is bound to explicit one-time GitHub OAuth intent', async () => {
  const source = await read('artifacts/vibeguard/src/contexts/AuthContext.tsx');
  const authPage = await read('artifacts/vibeguard/src/pages/AuthPage.tsx');
  assert.match(authPage, /sessionStorage\.setItem\('vs_github_oauth_pending', 'github'\)/);
  assert.match(source, /githubOauthPending && s\?\.provider_token && s\.access_token && hasGithubIdentity/);
  assert.match(source, /window\.sessionStorage\.removeItem\('vs_github_oauth_pending'\)/);
  assert.match(authPage, /sessionStorage\.removeItem\('vs_github_oauth_pending'\)/);
  assert.match(authPage, /provider: 'github', options: \{ scopes: 'repo', redirectTo \}/);
  assert.match(authPage, /provider: 'google', options: \{ redirectTo \}/);
});

test('Server encrypts token and restricts it to the authenticated owner', async () => {
  const server = await read('artifacts/api-server/src/routes/github.ts');
  const crypto = await read('artifacts/api-server/src/lib/crypto.ts');
  assert.match(server, /router\.post\("\/github\/token", requireAuth/);
  assert.match(server, /encryptToken\(token\)/);
  assert.match(server, /ON CONFLICT \(owner\) DO UPDATE SET encrypted_token/);
  assert.match(server, /await upsertTokenRow\(req\.userId!, encrypted\)/);
  assert.match(crypto, /aes-256-gcm/);
  assert.doesNotMatch(server, /res\.json\(\{[^}]*token/);
});
