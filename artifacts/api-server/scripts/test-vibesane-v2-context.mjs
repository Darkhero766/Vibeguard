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

test('predictable reset tokens are Critical but unrelated MD5 calls stay High', () => {
  const source = [
    'if (req.query.token == md5(req.query.login)) { resetPassword(); }',
    'const digest = md5(nonSecurityCacheKey);',
    'if (req.body.token === md5(req.body.login)) { saveNewPassword(); }',
  ].join('\n');
  const found = scan(source, 'core/authHandler.js').filter(f => f.check === 'weak_hash');
  assert.deepEqual(found.map(f => f.severity), ['Critical', 'High', 'Critical']);
  assert.match(found[0].title, /account takeover/i);
});

test('cookie test fixtures are demoted but not silently hidden', () => {
  const content = 'res.cookie("session", token, { secure: true });';
  const testCase = scan(content, 'test/res.cookie.js')
    .find(f => f.check === 'cookie_missing_httponly');
  const prodCase = scan(content, 'app/routes/session.js')
    .find(f => f.check === 'cookie_missing_httponly');
  assert.equal(testCase?.severity, 'Low');
  assert.equal(prodCase?.severity, 'Medium');
});


test('same-handler req.body taint reaches named child_process.exec alias', () => {
  const source = [
    "var exec = require('child_process').exec;",
    "exports.create = function (req, res) {",
    "  var item = req.body.content;",
    "  var imgRegex = /image-url/;",
    "  var url = item.match(imgRegex)[1];",
    "  exec('identify ' + url, function () {});",
    "};",
  ].join('\n');
  const findings = scan(source, 'routes/index.js')
    .filter(f => f.check === 'command_injection');
  assert.deepEqual(findings.map(f => f.line), [6]);
});

test('shell alias rule does not flag static values or taint from another handler', () => {
  const source = [
    "var exec = require('child_process').exec;",
    "exports.first = function (req, res) {",
    "  var url = req.body.content;",
    "};",
    "exports.second = function (req, res) {",
    "  var url = 'safe-file.png';",
    "  exec('identify ' + url, () => {});",
    "  exec('identify fixed-file.png', () => {});",
    "};",
  ].join('\n');
  const findings = scan(source, 'routes/index.js')
    .filter(f => f.check === 'command_injection');
  assert.equal(findings.length, 0);
});

test('admin object password and moving GitHub tarball are detected on in-scope source', () => {
  const source = "var users = [{name: 'admin', password: Math.random().toString(32)}];";
  const findings = scan(source, 'routes/index.js').filter(f => f.check === 'weak_random');
  assert.deepEqual(findings.map(f => f.line), [1]);
  const manifest = JSON.stringify({ dependencies: {
    "grunt-if": "https://github.com/binarymist/grunt-if/tarball/master",
    "pinned": "https://github.com/binarymist/grunt-if/tarball/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  } }, null, 2);
  const depFindings = scan(manifest, 'package.json').filter(f => f.check === 'git_dependency');
  assert.deepEqual(depFindings.map(f => f.line), [3]);
});


test('source collector bundles both actual API-core and extended-v2 implementations', async () => {
  const { loadScanner } = await import('./collect-vibesane-public-evidence.mjs');
  const engines = await loadScanner();
  assert.equal(typeof engines.scanApiFiles, 'function');
  assert.equal(typeof engines.scanExtendedFilesV2, 'function');
  const cases = [
    { path: 'app/api/orders/route.ts',
      content: "export async function POST() { await db.from('orders').insert({ paid: true }); }" },
    { path: 'src/users.ts',
      content: "const users = [{ name: 'admin', password: Math.random().toString(32) }];" },
  ];
  assert.ok(engines.scanApiFiles(cases).some(f => f.check === 'unauthenticated_write'));
  assert.ok(engines.scanExtendedFilesV2(cases).some(f => f.check === 'weak_random'));
});

test('dynamic chart CSS is reviewed as Medium without asserting proven HTML XSS',()=>{
  const css=[
    'const ChartStyle=({id,config})=>{',
    'const colorConfig=Object.entries(config);',
    'return (<style',
    'dangerouslySetInnerHTML={{',
    '__html: Object.entries(THEMES).map(([theme,prefix])=>',
    'prefix + " { " + colorConfig.map(([key,item])=>"--color-" + key + ":" + item.color).join(" ") + " }").join("\\n")',
    '}} />);',
    '};',
  ].join('\n');
  const findings=scan(css,'src/components/ui/chart.tsx').filter(f=>f.check==='dangerous_html');
  assert.equal(findings.length,1);
  assert.equal(findings[0].severity,'Medium');
  assert.match(findings[0].description,/does not prove XSS/);
});

test('untrusted HTML is still High; customer ids are not auth tokens',()=>{
  const html='return <div dangerouslySetInnerHTML={{__html: userInput}} />;';
  assert.equal(scan(html,'src/components/View.tsx').find(f=>f.check==='dangerous_html')?.severity,'High');
  const generated='const customerId = "cus-" + Date.now() + "-" + Math.random().toString(36).slice(2,7);';
  assert.equal(scan(generated,'src/pages/sales-checkout.tsx').filter(f=>f.check==='weak_random').length,0);
  const secret='const resetToken = Math.random().toString(36);';
  assert.equal(scan(secret,'src/auth/reset.ts').filter(f=>f.check==='weak_random').length,1);
});
