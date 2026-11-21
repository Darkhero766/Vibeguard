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
