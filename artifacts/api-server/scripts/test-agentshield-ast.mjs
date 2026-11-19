import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeSource, analyzeRepositoryPaths } from './agentshield-ast.mjs';
import { parseHybridArgs } from './agentshield-hybrid.mjs';
import { benchmarkAst } from './benchmark-agentshield-ast.mjs';

const exec=promisify(execFile);
const scripts=path.dirname(fileURLToPath(import.meta.url));
const entry=path.join(scripts,'vibesane.mjs');
const tick=String.fromCharCode(96);
async function fixture(t) {
  const root=await mkdtemp(path.join(tmpdir(),'agentshield-ast-w6-'));
  t.after(async()=>rm(root,{recursive:true,force:true}));
  await exec('git',['init','-q',root],{timeout:5000});
  await mkdir(path.join(root,'src'),{recursive:true});
  return root;
}
async function hybrid(root,additional=[]) {
  let stdout,code=0;
  try {
    ({stdout}=await exec(process.execPath,[entry,'hybrid','--changed','--cwd',root,
      '--format','json',...additional],{timeout:25000,maxBuffer:1500000}));
  } catch(e) { if(typeof e.stdout !=='string') throw e;code=e.code;stdout=e.stdout; }
  return {code,result:JSON.parse(stdout),stdout};
}
const sqlFiles=[
  ['src/query.ts','const sql="SELECT * FROM users WHERE id=" + req.query.id;\nawait db.query(sql);\n'],
  ['src/params.ts','await db.query("SELECT * FROM users WHERE id=$1", [id]);\n'],
  ['src/static.ts','const a="SELECT * FROM users WHERE id=";\nconst b="42";\ndb.query(a+b);\n'],
];
test('AST detects SQL injection by local variable alias into SQL query sink',()=>{
  const r=analyzeSource('src/query.ts',sqlFiles[0][1]);
  assert.equal(r.status,'complete');
  assert.equal(r.findings.length,1);
  assert.equal(r.findings[0].ruleId,'unsafe_sql_dataflow');
  assert.equal(r.findings[0].engine,'typescript_ast_local');
  assert.equal(r.findings[0].line,2);
});
test('AST follows multistep alias in a function body',()=>{
  const r=analyzeSource('src/api.ts',
    'export async function go(id: string) { const base="SELECT id FROM users WHERE id=" + id; const alias=base; return db.execute(alias); }');
  assert.equal(r.findings.length,1);
  assert.equal(r.findings[0].severity,'High');
});
test('AST ignores safe parameterized queries',()=>{
  assert.equal(analyzeSource('src/params.ts',sqlFiles[1][1]).findings.length,0);
  assert.equal(analyzeSource('src/params.ts','db.execute("DELETE FROM users WHERE id=?", [id]);').findings.length,0);
});
test('AST ignores static concatenations and comments containing SQL',()=>{
  assert.equal(analyzeSource('src/static.ts',sqlFiles[2][1]).findings.length,0);
  assert.equal(analyzeSource('src/comment.ts','// db.query("SELECT" + evil);\nconst x = "safe";').findings.length,0);
});
test('AST supports TSX and interpolation via a variable',()=>{
  const content='function Widget({id}: {id:string}) {const q='+tick+'SELECT * FROM users WHERE id='+
    '$'+'{id}'+tick+'; db.query(q); return <div>ok</div>;}';
  const r=analyzeSource('src/component.tsx',content);
  assert.equal(r.findings.length,1);
});
test('AST does not claim to parse malformed TypeScript',()=>{
  const r=analyzeSource('src/broken.ts','const x = "SELECT"; function nope( { db.query(x);');
  assert.equal(r.status,'parse_incomplete');
  assert.equal(r.findings.length,0);
});
test('AST excludes SQL, JSON, YAML and unsupported languages from parser claims',()=>{
  for(const file of ['src/test.sql','src/a.json','src/a.py','src/a.yml']) {
    const r=analyzeSource(file,'db.query("SELECT" + user)');
    assert.equal(r.status,'unsupported');
  }
});
test('AST changed-file reader rejects absolute paths, traversal and duplicates',async t=>{
  const root=await fixture(t);
  await assert.rejects(()=>analyzeRepositoryPaths(root,['../sensitive.ts']));
  await assert.rejects(()=>analyzeRepositoryPaths(root,['/etc/passwd']));
  await assert.rejects(()=>analyzeRepositoryPaths(root,['src/a.ts','src/a.ts']));
});
test('AST refuses a symlink that escapes the Git repository',async t=>{
  const root=await fixture(t);
  const outer=await mkdtemp(path.join(tmpdir(),'agentshield-ast-outside-'));
  t.after(async()=>rm(outer,{recursive:true,force:true}));
  await writeFile(path.join(outer,'data.ts'),'const q="SELECT" + value;');
  await symlink(path.join(outer,'data.ts'),path.join(root,'src/escape.ts'));
  await assert.rejects(()=>analyzeRepositoryPaths(root,['src/escape.ts']));
});
test('AST reader enforces one-megabyte file budget',async t=>{
  const root=await fixture(t);
  await writeFile(path.join(root,'src/big.ts'),'x'.repeat(1_000_001));
  await assert.rejects(()=>analyzeRepositoryPaths(root,['src/big.ts']));
});
test('hybrid AST finds locally aliased SQL missed by regex-only scanner',async t=>{
  const root=await fixture(t);
  await writeFile(path.join(root,'src/query.ts'),sqlFiles[0][1]);
  const {code,result}=await hybrid(root,['--enable-ast']);
  assert.equal(code,1);
  assert.equal(result.status,'complete');
  assert.equal(result.ast.status,'complete');
  assert.ok(result.ast.findings.some(f=>f.ruleId==='unsafe_sql_dataflow'));
  assert.ok(!result.static.findings.some(f=>f.ruleId==='unsafe_sql_dataflow'));
  assert.equal(result.ai.status,'disabled');
  assert.equal(result.privacy.sourceSentToModel,false);
});
test('safe parameterized SQL returns no AST warning',async t=>{
  const root=await fixture(t);
  await writeFile(path.join(root,'src/params.ts'),sqlFiles[1][1]);
  const {code,result}=await hybrid(root,['--enable-ast']);
  assert.equal(code,0);
  assert.equal(result.status,'complete');
  assert.equal(result.ast.findings.length,0);
});
test('malformed TypeScript preserves static report but marks AST incomplete',async t=>{
  const root=await fixture(t);
  await writeFile(path.join(root,'src/broken.ts'),'export const JWT_SECRET = "'+'S'.repeat(40)+'";\nconst = ;');
  const {code,result}=await hybrid(root,['--enable-ast']);
  assert.equal(code,2);
  assert.equal(result.status,'scan_incomplete');
  assert.equal(result.ast.status,'scan_incomplete');
  assert.ok(result.static.findings.some(f=>f.ruleId==='hardcoded_jwt_secret'));
});
test('hybrid no-changed-files refuses a security pass',async t=>{
  const root=await fixture(t);
  const {code,result}=await hybrid(root,['--enable-ast']);
  assert.equal(code,2);
  assert.equal(result.status,'no_changed_files');
  assert.equal(result.ast.status,'no_changed_files');
});
test('opt-in AST supports only Git changed mode until file race support exists',()=>{
  assert.throws(()=>parseHybridArgs(['--file','src/auth.ts','--enable-ast']));
});
test('AST does not execute repository package scripts',async t=>{
  const root=await fixture(t);
  await writeFile(path.join(root,'package.json'),
    JSON.stringify({scripts:{prepare:'node -e "throw Error(\\"DO NOT EXECUTE\\")"'}}));
  await writeFile(path.join(root,'src/query.ts'),sqlFiles[0][1]);
  const {result}=await hybrid(root,['--enable-ast']);
  assert.equal(result.ast.status,'complete');
  assert.ok(result.ast.findings.length>0);
});

test('measured 24-case AST versus regex comparison preserves all labels and exposes misses',async()=>{
  const result=await benchmarkAst();
  assert.equal(result.cases,24);
  assert.equal(result.regexOnly.tp+result.regexOnly.tn+result.regexOnly.fp+result.regexOnly.fn,24);
  assert.equal(result.experimentalAst.tp+result.experimentalAst.tn+result.experimentalAst.fp+result.experimentalAst.fn,24);
  assert.ok(result.experimentalAst.recall >= result.regexOnly.recall);
  assert.equal(result.misses.ast.length,result.experimentalAst.fp+result.experimentalAst.fn);
  console.log('OBSERVED_AGENTSIELD_AST_COMPARE='+JSON.stringify(result));
});
