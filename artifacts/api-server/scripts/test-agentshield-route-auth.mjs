import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeNextRouteAuth } from './agentshield-route-auth.mjs';
const path='app/api/orders/route.ts';
const scan=src=>analyzeNextRouteAuth(path,src);

test('finds unguarded Next.js POST insert',()=>{
 const r=scan('export async function POST(req: Request){const body=await req.json();return db.from("orders").insert(body);}');
 assert.equal(r.status,'complete');assert.equal(r.findings.length,1);
 assert.equal(r.findings[0].ruleId,'nextjs_mutation_auth_unverified');
});
test('finds an unchecked auth.getUser call before mutation',()=>{
 const r=scan('export async function POST(){await auth.getUser();await db.from("orders").insert({});}');
 assert.equal(r.findings.length,1);
});
test('finds an unchecked getServerSession call before mutation',()=>{
 const r=scan('export async function PATCH(){const session=await getServerSession();db.from("orders").update({});}');
 assert.equal(r.findings.length,1);
});
test('does not trust commented-out auth guards',()=>{
 const r=scan('// await requireAuth();\nexport async function POST(){return db.from("orders").insert({});}');
 assert.equal(r.findings.length,1);
});
test('requires guard to precede the write',()=>{
 const r=scan('export async function POST(){ db.from("orders").insert({}); await requireAuth(); }');
 assert.equal(r.findings.length,1);
});
test('accepts direct awaited requireAuth before a database write',()=>{
 const r=scan('export async function POST(){await requireAuth();await db.from("orders").insert({});}');
 assert.equal(r.findings.length,0);
});
test('accepts checked getServerSession with explicit rejection branch',()=>{
 const r=scan('export async function PATCH(){const session=await getServerSession();if(!session) return new Response("unauthorized",{status:401});db.from("orders").update({});}');
 assert.equal(r.findings.length,0);
});
test('accepts checked requireUser with throw rejection',()=>{
 const r=scan('export async function DELETE(){const user=await requireUser();if(!user)throw Error("no"); db.from("orders").delete();}');
 assert.equal(r.findings.length,0);
});
test('does not trust check of unrelated variable before a write',()=>{
 const r=scan('export async function POST(){const user=await getServerSession();if(!other) return;db.from("orders").insert({});}');
 assert.equal(r.findings.length,1);
});
test('handles exported PATCH arrow function',()=>{
 const r=scan('export const PATCH=async(request)=>{await db.from("orders").update({});return Response.json({ok:true});};');
 assert.equal(r.findings.length,1);
});
test('ignores read-only GET routes and unrelated UI update calls',()=>{
 assert.equal(scan('export async function GET(){const x=await db.from("orders").select("*");return Response.json(x);}').findings.length,0);
 assert.equal(scan('export async function POST(){ui.update({value:5});}').findings.length,0);
});
test('scopes detection to Next.js API route path, not arbitrary files',()=>{
 const r=analyzeNextRouteAuth('src/components/App.tsx','export function POST(){ db.from("orders").insert({}); }');
 assert.equal(r.status,'unsupported');assert.equal(r.findings.length,0);
});
test('syntactically invalid route is incomplete, not security-cleared',()=>{
 const r=scan('export async function POST( { db.from("orders").insert({});');
 assert.equal(r.status,'scan_incomplete');assert.equal(r.findings.length,0);
});
test('route handles both insertion and deletion risks without hiding findings',()=>{
 const r=scan('export async function POST(){ db.from("orders").insert({}); db.from("orders").delete(); }');
 assert.equal(r.findings.length,2);
});
test('auth call in a string is not an executed guard',()=>{
 const r=scan('export async function POST(){const note="await requireAuth()";return db.from("orders").insert({});}');
 assert.equal(r.findings.length,1);
});

test('unchecked requireUser result is not evidence of access denial',()=>{
 const r=scan('export async function POST(){const u=await requireUser();if(!other)return;db.from("orders").insert({});}');
 assert.equal(r.findings.length,1);
});

test('conditional requireAuth cannot authorize every write path',()=>{
 const r=scan('export async function POST(){if(Math.random()>0.5) await requireAuth();await db.from("orders").insert({});}');
 assert.equal(r.findings.length,1);
});
test('try/catch that swallows an auth error cannot authorize a mutation',()=>{
 const r=scan('export async function POST(){try{await requireAuth()}catch(err){console.warn(err)}await prisma.order.create({data:{}})}');
 assert.equal(r.findings.length,1);
});
test('conditional denial return is not proof of rejection',()=>{
 const r=scan('export async function POST(){const s=await getServerSession();if(!s){if(Math.random()>0.5)return;}await db.from("orders").insert({});}');
 assert.equal(r.findings.length,1);
});
test('nested callback return is not an auth denial',()=>{
 const r=scan('export async function POST(){const s=await getServerSession();if(!s){[1].forEach(()=>{return;});}await db.from("orders").insert({});}');
 assert.equal(r.findings.length,1);
});
test('an unconditional throw at the end of denial branch is recognized',()=>{
 const r=scan('export async function POST(){const s=await getServerSession();if(!s){console.warn("deny");throw Error("Unauthorized");}await db.from("orders").insert({});}');
 assert.equal(r.findings.length,0);
});
test('nested optional auth guard does not hide findings',()=>{
 const r=scan('export async function POST(){if(true){await requireUser();}await db.from("orders").insert({});}');
 assert.equal(r.findings.length,1);
});

test('Supabase getUser wrapper truthiness is not a valid user check',()=>{
 const r=scan('export async function POST(){const r=await auth.getUser();if(!r)return;db.from("orders").insert({});}');
 assert.equal(r.findings.length,1);
});
test('Supabase response data.user denial protects mutation',()=>{
 const r=scan('export async function POST(){const r=await auth.getUser();if(!r.data.user) return;db.from("orders").insert({});}');
 assert.equal(r.findings.length,0);
});
test('destructured Supabase data.user early denial protects mutation',()=>{
 const r=scan('export async function POST(){const {data:{user}}=await auth.getUser();if(!user)return;db.from("orders").insert({});}');
 assert.equal(r.findings.length,0);
});
test('destructured Supabase data early denial protects mutation',()=>{
 const r=scan('export async function POST(){const {data}=await auth.getUser();if(!data.user)throw Error("deny");db.from("orders").insert({});}');
 assert.equal(r.findings.length,0);
});
