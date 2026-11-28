import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const authPage = await readFile(path.join(root, 'src/pages/AuthPage.tsx'), 'utf8');
const authContext = await readFile(path.join(root, 'src/contexts/AuthContext.tsx'), 'utf8');
const envExample = await readFile(path.join(root, '.env.example'), 'utf8');
const setupGuide = await readFile(path.join(root, '../../docs/VIBESANE_CLERK_AUTH_SETUP.md'), 'utf8');

assert.match(authPage, /VITE_CLERK_AUTH_ENABLED === 'true'/,
  'Clerk sign-in must be opt-in and hidden by default.');
assert.match(envExample, /^VITE_CLERK_AUTH_ENABLED=false$/m,
  'The documented default must keep Clerk disabled until the provider exists.');
assert.match(authPage, /provider:\s*'custom:clerk'/,
  'Clerk must authenticate through the configured Supabase custom provider.');
assert.match(authPage, /scopes:\s*'openid profile email'/,
  'Clerk must request only the identity scopes required by the application.');
assert.match(authPage, /Continue with Clerk/,
  'The Clerk sign-in action must be discoverable when enabled.');
assert.match(authPage, /localStorage\.setItem\(REFERRAL_STORAGE_KEY/,
  'Referral attribution must be persisted before OAuth redirects.');
assert.match(authPage, /catch \(err: unknown\)[\s\S]*setClerkLoading\(false\)/,
  'Clerk OAuth errors must restore the button instead of leaving it stuck in loading state.');
for (const existing of [
  'supabase.auth.signInWithPassword',
  "provider: 'google'",
  "provider: 'github'",
]) {
  assert.ok(authPage.includes(existing), 'Existing sign-in path was removed: ' + existing);
}
assert.match(authContext, /supabase\.auth\.getSession\(\)/,
  'Supabase must remain the application session authority after Clerk OAuth.');
assert.match(authContext, /ensureUsageRow\(u\.id\)/,
  'Existing Supabase UUID usage ownership must remain intact.');
assert.match(authContext, /Authorization:\s*`Bearer \$\{session\.access_token\}`/,
  'Authenticated API calls must continue to use the Supabase access token.');
assert.ok(!/VITE_CLERK_(?:SECRET|CLIENT_SECRET|SECRET_KEY)/i.test(envExample),
  'A Clerk secret must never be exposed through Vite environment variables.');
assert.ok(!/CLERK_(?:SECRET_KEY|CLIENT_SECRET)\s*=/.test(authPage),
  'No Clerk client secret may be embedded in frontend source.');
for (const required of [
  'custom:clerk', 'Client Secret', 'VITE_CLERK_AUTH_ENABLED=true',
  'staging', 'existing-account',
]) {
  assert.ok(setupGuide.toLowerCase().includes(required.toLowerCase()),
    'Clerk setup guide is missing requirement: ' + required);
}
process.stdout.write('Clerk OAuth feature gate, existing auth contracts, session ownership and secret-boundary checks passed.\n');
