import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {analyzeSupabasePolicies} from './agentshield-supabase-policy.mjs';
const exec=promisify(execFile);
const scripts=path.dirname(fileURLToPath(import.meta.url));
const sql=content=>analyzeSupabasePolicies('supabase/migrations/001.sql',content);
test('reports explicit public table RLS disablement',()=>{
 const r=sql('ALTER TABLE public.orders DISABLE ROW LEVEL SECURITY;');
 assert.equal(r.findings.length,1);
 assert.equal(r.findings[0].ruleId,'public_table_rls_disabled');
 assert.equal(r.findings[0].severity,'Critical');
});
test('quoted public table RLS disablement is detected',()=>{
 const r=sql('ALTER TABLE "public"."orders" DISABLE ROW LEVEL SECURITY;');
 assert.equal(r.findings.length,1);
});
test('does not flag enabled RLS',()=>{
 assert.equal(sql('ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;').findings.length,0);
});
test('flags unrestricted authenticated UPDATE policy',()=>{
 const r=sql('CREATE POLICY "update any" ON public.orders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);');
 assert.equal(r.findings.length,1);
 assert.equal(r.findings[0].ruleId,'supabase_unrestricted_write_policy');
});
test('flags unrestricted public ALL policy',()=>{
 const r=sql('CREATE POLICY open ON public.documents FOR ALL TO PUBLIC USING (true);');
 assert.equal(r.findings.length,1);
});
test('does not classify public read-only SELECT policy as a security breach',()=>{
 const r=sql('CREATE POLICY public_read ON public.blog FOR SELECT TO anon USING (true);');
 assert.equal(r.findings.length,0);
});
test('owner-scoped UPDATE policy is not classified as unrestricted',()=>{
 const r=sql('CREATE POLICY edit ON public.orders FOR UPDATE TO authenticated USING (auth.uid() = owner) WITH CHECK(auth.uid() = owner);');
 assert.equal(r.findings.length,0);
});
test('grant statement is not itself proof of RLS failure',()=>{
 assert.equal(sql('GRANT SELECT ON TABLE public.orders TO authenticated;').findings.length,0);
});
test('commented dangerous SQL statements are ignored',()=>{
 assert.equal(sql('-- ALTER TABLE public.orders DISABLE ROW LEVEL SECURITY;\nSELECT 1;').findings.length,0);
});
test('multiple independent SQL risks return multiple paths and line positions',()=>{
 const r=sql('ALTER TABLE public.orders DISABLE ROW LEVEL SECURITY;\nCREATE POLICY open ON public.orders FOR UPDATE TO authenticated USING (true);');
 assert.equal(r.findings.length,2);
 assert.equal(r.findings[1].line,2);
});
test('does not label .sql.fixture as deployable SQL',()=>{
 const r=analyzeSupabasePolicies('supabase/review-only/unsafe.sql.fixture','ALTER TABLE public.orders DISABLE ROW LEVEL SECURITY;');
 assert.equal(r.status,'unsupported');assert.equal(r.findings.length,0);
});
test('SQL source length budget is enforced',()=>{
 assert.throws(()=>sql(' '.repeat(1_000_001)));
});
test('findings are metadata-only and do not include SQL text or secrets',()=>{
 const secret='UNSAFE_FIXTURE_PLACEHOLDER_NOT_REAL';
 const r=sql('ALTER TABLE public.orders DISABLE ROW LEVEL SECURITY; --'+secret);
 assert.ok(!JSON.stringify(r).includes(secret));
});
test('hybrid CLI detects changed SQL RLS policy problem in isolated Git project',async t=>{
 const root=await mkdtemp(path.join(tmpdir(),'agentshield-rls-'));
 t.after(async()=>rm(root,{recursive:true,force:true}));
 await exec('git',['init','-q',root],{timeout:5000});
 await mkdir(path.join(root,'migrations'));
 await writeFile(path.join(root,'migrations/001.sql'),
   'CREATE POLICY unsafe ON public.orders FOR UPDATE TO authenticated USING (true);');
 const entry=path.join(scripts,'vibesane.mjs');
 let stdout,exit=0;
 try{({stdout}=await exec(process.execPath,[entry,'hybrid','--changed','--cwd',root,'--enable-ast','--format','json'],{timeout:25000,maxBuffer:1_000_000}));}
 catch(e){exit=e.code;if(typeof e.stdout!=='string')throw e;stdout=e.stdout;}
 const report=JSON.parse(stdout);
 assert.equal(exit,1);
 assert.equal(report.status,'complete');
 assert.equal(report.ast.sqlFilesAnalyzed,1);
 assert.ok(report.ast.sqlPolicyFindings.some(f=>f.ruleId==='supabase_unrestricted_write_policy'));
 assert.equal(report.ai.status,'disabled');
});
test('safe changed SQL remains unflagged by experimental policy analyzer',async t=>{
 const root=await mkdtemp(path.join(tmpdir(),'agentshield-rls-safe-'));
 t.after(async()=>rm(root,{recursive:true,force:true}));
 await exec('git',['init','-q',root],{timeout:5000});
 await writeFile(path.join(root,'001.sql'),
   'CREATE POLICY owner ON public.orders FOR UPDATE TO authenticated USING(auth.uid() = owner) WITH CHECK(auth.uid() = owner);');
 const entry=path.join(scripts,'vibesane.mjs');
 const {stdout}=await exec(process.execPath,[entry,'hybrid','--changed','--cwd',root,'--enable-ast','--format','json'],{timeout:25000});
 const report=JSON.parse(stdout);
 assert.equal(report.status,'complete');
 assert.equal(report.ast.sqlPolicyFindings.length,0);
});
