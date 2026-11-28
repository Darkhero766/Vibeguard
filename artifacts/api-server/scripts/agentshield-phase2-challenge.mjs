// Frozen first-pass synthetic challenge examples for experimental Phase 2 rules.
// Do not retune and describe these labels as an untouched holdout afterwards.
// No customer projects, secrets or known exploit proof is represented here.
const rawHelper='export function rawLookup(id){const sql="SELECT * FROM orders WHERE id="+id;db.query(sql);}';
const boundHelper='export function boundLookup(id){db.query("SELECT * FROM orders WHERE id=$1",[id]);}';
function cross(id,source,caller,expected,helper=rawHelper){
 return {id:'cross-'+id,category:'cross_file',expected,
   files:[{path:'src/db.ts',content:helper},{path:'src/api.ts',content:source+caller}],
   rationale:'Synthetic named relative import and request-to-SQL flow'};
}
const crossRisks=[
  cross('01','import {rawLookup} from "./db";','rawLookup(req.query.id);',true),
  cross('02','import {rawLookup as load} from "./db";','load(req.body.id);',true),
  cross('03','import {rawLookup} from "./db";const id=req.params.id;','rawLookup(id);',true),
  cross('04','import {rawLookup} from "./db";const value=req.headers["x-value"];','rawLookup(value);',true),
  cross('05','import {rawLookup} from "./db";const id=request.nextUrl.searchParams.get("id");','rawLookup(id);',true),
  cross('06','import {rawLookup} from "./db";const {id}=req.body;','rawLookup(id);',true),
  cross('07','import {rawLookup} from "./db";const id=ctx.request.body.id;','rawLookup(id);',true),
  cross('08','import {rawLookup} from "./db";const id=req.query.id;const slug=id;','rawLookup(slug);',true),
  cross('09','import {rawLookup} from "./db";async function route(req){const id=req.query.id;','rawLookup(id);}',true),
  cross('10','import rawLookup from "./db";','rawLookup(req.query.id);',true,
    'export default function rawLookup(id){db.query("SELECT * FROM orders WHERE id="+id);}'),
];
const crossControls=[
  cross('11','import {boundLookup} from "./db";','boundLookup(req.query.id);',false,boundHelper),
  cross('12','import {rawLookup} from "./db";','rawLookup(Number(req.query.id));',false),
  cross('13','import {rawLookup} from "./db";','rawLookup("42");',false),
  cross('14','import {rawLookup} from "./db";','rawLookup(42);',false),
  cross('15','import {rawLookup} from "some-package";','rawLookup(req.query.id);',false),
  cross('16','import {rawLookup} from "./db";','console.log(req.query.id);',false),
  cross('17','import {rawLookup} from "./db";','rawLookup("req.query.id");',false),
  cross('18','import {boundLookup} from "./db";','boundLookup(req.body.id);',false,boundHelper),
  cross('19','import {rawLookup} from "./db";const id=BigInt(req.params.id);','rawLookup(id);',false),
  cross('20','import {rawLookup} from "./db";const id=100;','rawLookup(id);',false),
];
function route(id,content,expected){
 return {id:'route-'+id,category:'nextjs_auth',expected,
  path:'app/api/orders/route.ts',content,
  rationale:'Synthetic route mutation with/without explicit checked authentication'};
}
const routeRisks=[
  route('01','export async function POST(){db.from("orders").insert({});}',true),
  route('02','export async function PATCH(){await auth.getUser();db.from("orders").update({});}',true),
  route('03','export async function POST(){const s=await getServerSession();db.from("orders").insert({});}',true),
  route('04','export async function DELETE(){const s=await getServerSession();db.from("orders").delete();if(!s)return;}',true),
  route('05','export async function POST(){const u=await requireUser();if(!other)return;db.from("orders").insert({});}',true),
  route('06','export async function PUT(){await prisma.order.update({where:{id:1}});}',true),
  route('07','export const PATCH=async()=>{db.from("orders").update({});};',true),
  route('08','export async function POST(){const note="requireAuth()";await db.from("orders").insert({});}',true),
  route('09','export async function POST(){const user=await auth.getUser();if(user){db.from("orders").insert({});}}',true),
  route('10','export async function POST(){const s=await getServerSession();if(!s){console.log("deny")}db.from("orders").insert({});}',true),
];
const routeControls=[
  route('11','export async function POST(){await requireAuth();db.from("orders").insert({});}',false),
  route('12','export async function POST(){const session=await getServerSession();if(!session)return;db.from("orders").insert({});}',false),
  route('13','export async function POST(){const user=await requireUser();if(!user)throw Error("deny");db.from("orders").insert({});}',false),
  route('14','export async function GET(){return db.from("orders").select("*");}',false),
  route('15','export async function POST(){ui.update({x:1});}',false),
  route('16','export async function PATCH(){await requireAuth();db.from("orders").update({});}',false),
  route('17','export async function PUT(){const s=await getServerSession();if(s==null)throw Error("deny");db.from("orders").update({});}',false),
  route('18','export async function POST(){await requireUser();db.from("orders").insert({});}',false),
  route('19','export async function POST(){const session=await getServerSession();if(!session){return new Response("no",{status:401})}db.from("orders").insert({});}',false),
  route('20','export async function POST(){const s=await verifySession();if(!s)return;await prisma.order.create({data:{}});}',false),
];
export const PHASE2_CHALLENGE=[
 ...crossRisks,...crossControls,...routeRisks,...routeControls,
];
