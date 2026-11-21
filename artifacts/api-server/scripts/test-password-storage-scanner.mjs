import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const result = await build({
  entryPoints: [path.join(dir, '../src/lib/passwordStorageScanner.ts')],
  bundle: true, platform: 'node', format: 'esm', write: false,
  logLevel: 'silent', target: 'node20',
});
const url = 'data:text/javascript;base64,' +
  Buffer.from(result.outputFiles[0].contents).toString('base64');
const { scanPotentialPlaintextPasswords } = await import(url);
const scan = (content, filePath = 'app/data/user-dao.js') =>
  scanPotentialPlaintextPasswords([{ path: filePath, content }]);

test('detects NodeGoat-like plaintext password document with commented safe alternative', () => {
  const source = [
    'function addUser(userName, password) {',
    '  const user = {',
    '    userName,',
    '    password // received from the request',
    '    /* password: bcrypt.hashSync(password, bcrypt.genSaltSync()) */',
    '  };',
    '  usersCol.insert(user, (err) => callback(err));',
    '}',
  ].join('\n');
  const findings = scan(source);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 2);
  assert.equal(findings[0].check, 'plaintext_password_storage');
  assert.equal(findings[0].severity, 'High');
});

test('detects request password directly assigned to persisted record field', () => {
  const source = 'const account = {name: req.body.name, password: req.body.password}; await db.insertOne(account);';
  assert.equal(scan(source)[0]?.check, 'plaintext_password_storage');
});

test('does not flag transformed bcrypt/argon2 hashes or unrelated data', () => {
  const cases = [
    'const account = { password: await bcrypt.hash(req.body.password, 12) }; db.insert(account);',
    'password = await bcrypt.hash(password, 12); const user = { password }; db.insert(user);',
    'const user = { passwordHash: bcrypt.hashSync(rawPassword, salt) }; db.insert(user);',
    'const user = { password }; console.log(user);',
    '// const user = {password}; db.insert(user);',
    'const user = { /* password, */ username }; db.insert(user);',
  ];
  for (const source of cases) {
    assert.equal(scan(source).length, 0, source);
  }
});

test('ignores non-code files, larger ambiguous literals and false stand-alone references', () => {
  assert.equal(scan('const user={password}; db.insert(user);', 'README.md').length, 0);
  assert.equal(scan('const user={password}; db.find(user);').length, 0);
  assert.equal(scan('const user = { password }; ' + 'x'.repeat(1700) + ' db.insert(user);').length, 0);
});

// Regression: an npm lockfile with legacy integrity digests must not produce
// thousands of fake High severity application-hashing vulnerabilities.
const extendedBuild = await build({
  entryPoints: [path.join(dir, '../src/lib/extendedScanner.ts')],
  bundle: true, platform: 'node', format: 'esm', write: false,
  logLevel: 'silent', target: 'node20',
});
const extendedUrl = 'data:text/javascript;base64,' +
  Buffer.from(extendedBuild.outputFiles[0].contents).toString('base64');
const { scanExtendedFiles } = await import(extendedUrl);

test('does not report npm sha1 integrity entries as weak application hashing', () => {
  const packages = Object.fromEntries(Array.from({ length: 1303 }, (_, i) => [
    'node_modules/example-' + i, { integrity: 'sha1-aBcDeFgHiJkLmNoPqRsTuVwXyZ0=' },
  ]));
  const lockfile = JSON.stringify({ name: 'sample', lockfileVersion: 2, packages });
  const results = scanExtendedFiles([{ path: 'package-lock.json', content: lockfile }]);
  assert.equal(results.filter((f) => f.check === 'weak_hash').length, 0);
});

test('detects executable weak-hash calls while ignoring harmless hash names', () => {
  const source = [
    "const a = crypto.createHash('sha1').update(password).digest('hex');",
    'const b = md5(password);',
    "const checksum = crypto.subtle.digest('SHA-1', bytes);",
    "const metadata = 'sha1-dependency-integrity';",
    "const algorithm = 'md5';",
  ].join('\n');
  const results = scanExtendedFiles([{ path: 'src/crypto.js', content: source }]);
  assert.deepEqual(results.filter((f) => f.check === 'weak_hash').map((f) => f.line), [1, 2, 3]);
});

const readerBuild = await build({
  entryPoints: [path.join(dir, '../src/lib/githubRepoReader.ts')],
  bundle: true, platform: 'node', format: 'esm', write: false,
  logLevel: 'silent', target: 'node20',
});
const readerUrl = 'data:text/javascript;base64,' +
  Buffer.from(readerBuild.outputFiles[0].contents).toString('base64');
const { shouldRead } = await import(readerUrl);

test('repository reader includes text PEM private-key files without admitting binaries', () => {
  assert.equal(shouldRead('artifacts/cert/server.key'), true);
  assert.equal(shouldRead('keys/deploy.pem'), true);
  assert.equal(shouldRead('keys/deploy.p12'), false);
  assert.equal(shouldRead('node_modules/secret.key'), false);
});

test('extended scanner detects PEM private-key files in eligible source', () => {
  const sample = '-----BEGIN RSA PRIVATE KEY-----\nSYNTHETIC_TEST_ONLY\n-----END RSA PRIVATE KEY-----';
  const findings = scanExtendedFiles([{ path: 'artifacts/cert/server.key', content: sample }]);
  assert.equal(findings.filter((f) => f.check === 'private_key').length, 1);
});

test('credential URL rule rejects database hosts without embedded credentials and README placeholders', () => {
  const cases = [
    { path: 'docker-compose.yml', content: 'MONGODB_URI: mongodb://mongo:27017/nodegoat' },
    { path: 'README.md', content: 'mongodb://<username>:<password>@<cluster>/<dbname>?ssl=true' },
    { path: 'README.md', content: 'postgresql://<user>:<password>@<hostname>/db' },
  ];
  for (const input of cases) {
    assert.equal(scanExtendedFiles([input]).filter((f) => f.check === 'database_url').length, 0, input.content);
  }
});

test('credential URL rule still detects literal user:password database URLs', () => {
  const cases = [
    'const db = "postgresql://alice:p%40ss@db.example.com:5432/main";',
    'const db = "mongodb://alice:secret@db.example.com/nodegoat";',
    'const db = "mysql://alice:secret@db.example.com/app";',
  ];
  for (const content of cases) {
    const matches = scanExtendedFiles([{ path: 'src/db.ts', content }]).filter((f) => f.check === 'database_url');
    assert.equal(matches.length, 1, content);
    assert.equal(matches[0].severity, 'Critical');
  }
});

test('cookie rule ignores block-commented code and explicit HttpOnly cookies', () => {
  const source = [
    '/* earlier session implementation:',
    '   res.cookie("session", sessionId);',
    '   req.session.userId = user._id;',
    '*/',
    'res.cookie("safe", token, { httpOnly: true, secure: true });',
    'res.cookie("unsafe", token, { secure: true });',
  ].join('\n');
  const results = scanExtendedFiles([{ path: 'app/routes/session.js', content: source }])
    .filter((f) => f.check === 'cookie_missing_httponly');
  assert.deepEqual(results.map((f) => f.line), [6]);
});


test('lexically quoted adversarial XSS fixtures are not executable eval/innerHTML', () => {
  const src = [
    'var xss = \'javascript:eval(document.body.innerHTML=\x60<p>XSS</p>\x60);\';',
    'var encodedXss = \'javascript:eval(document.body.innerHTML=%60%3C%3E);\';',
    'eval(untrustedRequest);',
    'document.body.innerHTML = userValue;',
    'const snippet = "eval(shouldStayText)";',
  ].join('\n');
  const flagged = scanExtendedFiles([{ path: 'test/res.redirect.js', content: src }])
    .filter(f => ['eval_usage', 'innerhtml_assignment'].includes(f.check));
  assert.deepEqual(flagged.map(f => [f.check, f.line]).sort(),
    [['eval_usage', 3], ['innerhtml_assignment', 4]]);
});

test('simple literal filter keeps executable eval beside a closed string', () => {
  const src = [
    'const label = "harmless"; eval(untrustedRequest);',
    'const text = "not executable"; eval(again);',
    "let sample = 'javascript:eval(fake)'; eval(real);",
  ].join('\n');
  const matches = scanExtendedFiles([{ path: 'src/handler.js', content: src }])
    .filter(f => f.check === 'eval_usage');
  assert.deepEqual(matches.map(f => f.line), [1, 2, 3]);
});

test('directly adjacent verified constant cookie options resolve HttpOnly safely', () => {
  const src = [
    'function handler(req, res, sessionCookie) {',
    '  const opts = { maxAge: 100, httpOnly: true, secure: false /* local only */ };',
    "  res.cookie('session', sessionCookie, opts);",
    '  const missing = { secure: true };',
    "  res.cookie('missing', sessionCookie, missing);",
    '  const disabled = { httpOnly: false };',
    "  res.cookie('disabled', sessionCookie, disabled);",
    '  const mutated = { httpOnly: true };',
    '  mutated.httpOnly = false;',
    "  res.cookie('mutated', sessionCookie, mutated);",
    '}',
  ].join('\n');
  const all = scanExtendedFiles([{ path: 'auth-sessions/app.js', content: src }]);
  assert.deepEqual(all.filter(f => f.check === 'cookie_missing_httponly').map(f => f.line),
    [5, 7, 10]);
  assert.equal(all.some(f => f.check === 'cookie_insecure' && f.line === 2), true);
});

test('cookie options with spreads or mutation are never assumed HttpOnly-protected', () => {
  const src = [
    'const options = { ...config, httpOnly: true };',
    "res.cookie('maybe', session, options);",
    'const fromDynamic = { httpOnly: true };',
    'fromDynamic.httpOnly = false;',
    "res.cookie('unsafe', session, fromDynamic);",
  ].join('\n');
  const flagged = scanExtendedFiles([{ path: 'src/auth.js', content: src }])
    .filter(f => f.check === 'cookie_missing_httponly');
  assert.deepEqual(flagged.map(f => f.line), [2, 5]);
});
