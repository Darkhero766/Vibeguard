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
