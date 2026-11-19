// Fresh synthetic challenge set for request-to-SQL taint. These examples are
// NOT proof of actual exploitability and were not used to tune this detector.
const tick=String.fromCharCode(96);
const tpl=(s,x)=>tick+s+'$'+'{'+x+'}'+tick;
const groups=[
  { category:'express_http_inputs',path:'src/routes/users.ts',risky:[
    'const id=req.query.id;db.query("SELECT * FROM users WHERE id="+id);',
    'const body=req.body;pool.query("UPDATE users SET role="+body.role);',
    'const value=req.params.slug;const q="DELETE FROM users WHERE slug="+value;db.query(q);',
    'const id=req.headers["x-id"];const q="SELECT * FROM users WHERE id="+id;db.execute(q);',
    'function api(req){const id=req.query.id;const sql="SELECT * FROM users WHERE id="+id;return client.query(sql);}',
  ],benign:[
    'db.query("SELECT * FROM users WHERE id=$1",[req.query.id]);',
    'pool.execute("DELETE FROM users WHERE id=?",[req.params.id]);',
    'const id=Number(req.query.id);db.query("SELECT * FROM users WHERE id="+id);',
    'const q="SELECT * FROM users";db.query(q);',
    'const value=req.body.id;console.log(value);',
  ]},
  {category:'nextjs_request_methods',path:'app/api/orders/route.ts',risky:[
    'async function POST(request){const body=await request.json();const q="DELETE FROM orders WHERE id="+body.id;db.query(q);}',
    'async function GET(request){const id=request.nextUrl.searchParams.get("id");db.query("SELECT * FROM orders WHERE id="+id);}',
    'async function POST(request){const raw=await request.text();db.query("SELECT id FROM orders WHERE code="+raw);}',
    'async function GET(request){const url=new URL(request.url);const id=url.searchParams.get("id");db.query("SELECT id FROM orders WHERE id="+id);}',
    'async function POST(req){const body=await req.json();const q="UPDATE orders SET total="+body.total;pool.query(q);}',
  ],benign:[
    'async function POST(request){const b=await request.json();db.query("UPDATE orders SET qty=$1",[b.qty]);}',
    'async function GET(request){const id=Number(request.nextUrl.searchParams.get("id"));db.query("SELECT id FROM orders WHERE id="+id);}',
    'async function POST(request){const b=await request.json();await prisma.order.create({data:b});}',
    'async function GET(request){const query="SELECT id FROM orders";db.query(query);}',
    'async function POST(request){const raw=await request.text();logger.info(raw);}',
  ]},
  {category:'unsafe_sql_api_variants',path:'src/db/queries.ts',risky:[
    'const id=req.query.id;prisma.$queryRawUnsafe("SELECT * FROM users WHERE id="+id);',
    'const id=req.params.id;prisma.$executeRawUnsafe("DELETE FROM users WHERE id="+id);',
    'const id=req.body.id;sequelize.query("SELECT * FROM users WHERE id="+id);',
    'const id=req.query.id;knex.raw("SELECT * FROM users WHERE id="+id);',
    'const id=req.query.id;database.query("SELECT * FROM users WHERE id="+id);',
  ],benign:[
    'const id=req.params.id;prisma.$queryRaw`SELECT * FROM users WHERE id=${id}`;',
    'const id=req.query.id;await prisma.user.findUnique({where:{id}});',
    'const id=req.body.id;db.query("SELECT * FROM users WHERE id=$1",[id]);',
    'const q="SELECT id FROM users";sequelize.query(q);',
    'const id=req.params.id;knex("users").where("id",id);',
  ]},
  {category:'untrusted_transformations',path:'src/api/handlers.ts',risky:[
    'const id=String(req.query.id);const q="SELECT * FROM users WHERE id="+id;db.query(q);',
    'const id=encodeURIComponent(req.query.id);db.query("SELECT id FROM users WHERE id="+id);',
    'const id=escapeSql(req.body.id);db.query("DELETE FROM users WHERE id="+id);',
    'const id=JSON.stringify(req.body);db.query("UPDATE users SET metadata="+id);',
    'const id=req.params.id;const q='+tpl('SELECT id FROM users WHERE id=', 'id')+';pool.query(q);',
  ],benign:[
    'const id=parseInt(req.query.id,10);db.query("SELECT * FROM users WHERE id="+id);',
    'const id=parseFloat(req.query.id);db.query("SELECT * FROM users WHERE id="+id);',
    'const id=BigInt(req.params.id);db.query("SELECT id FROM users WHERE id="+id);',
    'const id=req.query.id;db.execute("SELECT id FROM users WHERE id=?",[id]);',
    'const id=42;const q="SELECT id FROM users WHERE id="+id;db.query(q);',
  ]},
  {category:'input_alias_and_context',path:'src/app/routes.ts',risky:[
    'const id=ctx.request.body.id;db.query("SELECT * FROM orders WHERE id="+id);',
    'const id=context.req.query.id;db.query("SELECT * FROM orders WHERE id="+id);',
    'const id=req.cookies.session;db.query("SELECT id FROM orders WHERE session="+id);',
    'const id=req.headers.get("x-id");db.query("SELECT * FROM orders WHERE id="+id);',
    'const id=req.query.id;const user=id;const token=user;db.query("SELECT * FROM users WHERE token="+token);',
  ],benign:[
    '// const q="SELECT id FROM users WHERE id="+req.body.id;\nconst x=4;',
    'const id="req.query.id";db.query("SELECT * FROM users WHERE id="+id);',
    'const id=req.params.id;queryClient.query(id);',
    'const id=req.params.id;await db.query("SELECT * FROM users WHERE id=$1",[id]);',
    'const id=Number(req.cookies.session);db.query("SELECT id FROM orders WHERE session="+id);',
  ]},
];
export const TAINT_CHALLENGE = groups.flatMap(g=>[
  ...g.risky.map((content,i)=>({
    id:g.category+'-risk-'+(i+1),category:g.category,path:g.path,
    expected:true,content,rationale:'Synthetic request input to a dynamic SQL sink; human review warranted',
  })),
  ...g.benign.map((content,i)=>({
    id:g.category+'-control-'+(i+1),category:g.category,path:g.path,
    expected:false,content,rationale:'Synthetic parameterized, static, typed or non-SQL control',
  })),
]);
