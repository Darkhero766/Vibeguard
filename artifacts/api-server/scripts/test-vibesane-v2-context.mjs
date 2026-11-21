import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: [new URL('../src/lib/extendedScannerV2.ts', import.meta.url).pathname],
  bundle: true, platform: 'node', format: 'esm', write: false,
  target: 'node24', logLevel: 'silent',
});
const moduleUrl = 'data:text/javascript;base64,' +
  Buffer.from(bundle.outputFiles[0].contents).toString('base64');
const { scanExtendedFilesV2 } = await import(moduleUrl);
const scan = (source, path = 'src/api.js') =>
  scanExtendedFilesV2([{ path, content: source }]);

test('HTTP URL alone, docs examples and parsing examples are not insecure network calls', () => {
  const code = [
    'const docs = "http://docs.vendor.test/tutorial";',
    'const url = new URL("http://public.service.test/query");',
    'request.get("https://secure.vendor.net/path");',
    'const example = "fetch(\'http://placeholder.example.com/test\')";',
    'const fromTest = "http://example.com/";',
    "const quotedCall = 'fetch(\\\"http://real.service.test/api\\\")';",
  ].join('\n');
  assert.equal(scan(code).filter(f => f.check === 'http_url').length, 0);
});

test('direct explicit HTTP fetch, axios and request calls still warn', () => {
  const code = [
    'fetch("http://real.service.test/api");',
    'axios.post("http://intranet.service.test/submit", data);',
    'request.get("http://untrusted.service.test/");',
    'fetch("https://real.service.test/api");',
    'fetch("http://localhost:3000/");',
    'fetch("http://example.org/");',
    'const target = "http://real.service.test/api"; fetch(target);',
  ].join('\n');
  const results = scan(code).filter(f => f.check === 'http_url');
  assert.deepEqual(results.map(f => f.line), [1, 2, 3]);
});

test('double-submit CSRF cookie intentionally readable by browser is not misreported', () => {
  const source = [
    'function attachCsrfToken(url, cookie, value) {',
    '  return function(req, res, next) {',
    '    if (req.url == url) res.cookie(cookie, value);',
    '    next();',
    '  };',
    '}',
    "app.use(attachCsrfToken('/', 'csrfToken', tokenValue));",
    "res.cookie('session', signedJwt, { secure: true });",
  ].join('\n');
  const files = [
    { path: 'auth-sessions/app.js', content: source },
    { path: 'auth-sessions/script.js', content: "const csrfToken = getCookie('csrfToken');" },
  ];
  const findings = scanExtendedFilesV2(files)
    .filter(f => f.check === 'cookie_missing_httponly');
  assert.deepEqual(findings.map(f => f.line), [8]);
});

test('CSRF name alone does not hide a missing-HttpOnly warning without the matching reader', () => {
  const src = [
    'function attachCsrfToken(url, cookie, value) {',
    '  res.cookie(cookie, value);',
    '}',
    "app.use(attachCsrfToken('/', 'csrfToken', tokenValue));",
  ].join('\n');
  const findings = scan(src).filter(f => f.check === 'cookie_missing_httponly');
  assert.deepEqual(findings.map(f => f.line), [2]);
});

test('logged-in admin route stays a contextual security warning, not an automatic false positive', () => {
  const source = "app.get('/admin', routes.isLoggedIn, routes.admin);";
  const findings = scan(source).filter(f => f.check === 'debug_endpoint');
  assert.deepEqual(findings.map(f => f.line), [1]);
});
