import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadScanner} from './collect-vibesane-public-evidence.mjs';

const scanner=await loadScanner();
const file=(path,content)=>({path,content});
const combined=files=>[...scanner.scanApiFiles(files),...scanner.scanExtendedFilesV2(files)];
const ofKind=(xs,id)=>xs.filter(f=>f.check===id);

test('authenticating with hardcoded short admin password raises a redacted warning',()=>{
  const code=['const ','SIEM_PASS',' = "admin";','\nif (password === SIEM_PASS) return allow();'].join('');
  const got=ofKind(combined([file('app/api/monitoring/auth/route.ts',code)]),'hardcoded_secret');
  assert.equal(got.length,1);
  assert.equal(got[0].severity,'High');
  assert.equal(got[0].line,1);
  assert.doesNotMatch(JSON.stringify(got),/admin";/);
});

test('high-entropy diagnostic auth token must not be missed',()=>{
  const code=['const ','DIAG_AUTH_TOKEN',' = "fixture-a1b2c3d4e5f678901234";',
    '\nif (provided !== DIAG_AUTH_TOKEN) return deny();'].join('');
  const got=ofKind(combined([file('app/api/admin/diag/route.ts',code)]),'hardcoded_secret');
  assert.equal(got.length,1);
  assert.equal(got[0].line,1);
  assert.doesNotMatch(JSON.stringify(got),/fixture-a1b2c3d4e5f678901234/);
});

test('env vars and obvious placeholders are not literal auth credential leaks',()=>{
  const code=['const ','DIAG_AUTH_TOKEN',' = process.env.DIAG_AUTH_TOKEN;',
    '\nconst ','API_KEY',' = "placeholder_replace_me";'].join('');
  const got=ofKind(combined([file('app/api/diag/route.ts',code)]),'hardcoded_secret');
  assert.equal(got.length,0);
});

test('query-derived directory path used by readdir is a high-risk filesystem signal',()=>{
  const code=[
    'export async function GET(request) {',
    ' const { searchParams } = new URL(request.url);',
    ' const parsed = parseQuery(searchParams, filesQuerySchema);',
    ' const dirPath = parsed.data.path || "";',
    ' const baseDir = join(process.cwd(), "documents");',
    ' const targetDir = join(baseDir, dirPath);',
    ' return readdir(targetDir);',
    '}',
  ].join('\n');
  const got=ofKind(combined([file('app/api/files/route.ts',code)]),'path_traversal');
  assert.equal(got.length,1);
  assert.equal(got[0].line,7);
});

test('multiple source-to-file sinks are counted separately (directory and file)',()=>{
  const code=[
    'export async function GET(request) {',
    ' const { searchParams } = new URL(request.url);',
    ' const parsed = parseQuery(searchParams, filesQuerySchema);',
    ' const dirPath = parsed.data.path;',
    ' const file = parsed.data.file;',
    ' const baseDir = join(process.cwd(), "documents");',
    ' const targetDir = join(baseDir, dirPath);',
    ' await readdir(targetDir);',
    ' const filePath = join(baseDir, file);',
    ' return readFile(filePath);',
    '}',
  ].join('\n');
  const got=ofKind(combined([file('app/api/files/route.ts',code)]),'path_traversal');
  assert.equal(got.length,2);
  assert.deepEqual(got.map(x=>x.line),[8,10]);
});

test('static paths and validated path transform must not fabricate traversal',()=>{
  const code=[
    'const { searchParams } = new URL(request.url);',
    'const parsed = parseQuery(searchParams, schema);',
    'const safeName = validateBasename(parsed.data.file);',
    'const path = join(baseDir, safeName);',
    'await readFile(path);',
  ].join('\n');
  assert.equal(ofKind(combined([file('app/api/files/route.ts',code)]),'path_traversal').length,0);
});

test('unsafe client-side redirect taken directly from URL search params raises High',()=>{
  const code=[
    '"use client";',
    'const searchParams = useSearchParams();',
    'const redirect = searchParams.get("redirect");',
    'if (redirect) window.location.href = redirect;',
  ].join('\n');
  const got=ofKind(combined([file('app/login/LoginForm.tsx',code)]),'open_redirect');
  assert.equal(got.length,1);
  assert.equal(got[0].line,4);
});

test('fixed-site and separately validated redirect values are not treated as query-derived',()=>{
  const code=[
    'const searchParams = useSearchParams();',
    'const redirect = searchParams.get("redirect");',
    'const safeRoute = enforceSameOrigin(redirect);',
    'window.location.href = safeRoute;',
    'window.location.href = "/dashboard";',
  ].join('\n');
  assert.equal(ofKind(combined([file('app/login/LoginForm.tsx',code)]),'open_redirect').length,0);
});

test('query input in another route cannot taint a later unrelated route handler',()=>{
  const code=[
    'export async function GET(request) {',
    'const searchParams = new URL(request.url).searchParams;',
    'const file = searchParams.get("file");',
    'return new Response(file);',
    '}',
    'export async function POST() {',
    'const target=join(baseDir,file);',
    'return readFile(target);',
    '}',
  ].join('\n');
  assert.equal(ofKind(combined([file('app/api/files/route.ts',code)]),'path_traversal').length,0);
});
