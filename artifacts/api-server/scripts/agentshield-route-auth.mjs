// Experimental Next.js JS/TS mutation-route authorization lint.
// Looks for a checked auth result BEFORE a supported DB write. Does not follow
// middleware or external helper implementations; a finding is NOT exploit proof.
import ts from 'typescript';

const CODE=/(?:^|\/)app\/api(?:\/[^/]+)*\/route\.(?:[cm]?[jt]sx?)$/i;
const WRITE=new Set(['insert','update','upsert','delete','create','deleteMany','updateMany','createMany']);
const METHOD=new Set(['POST','PUT','PATCH','DELETE']);
const AUTH_SOURCE=/(?:\brequireAuth\s*\(|\brequireUser\s*\(|\bauth\.getUser\s*\(|\bgetServerSession\s*\(|\bverifySession\s*\()/;
const MAX=90_000;
function kind(name){
  return /\.tsx$/i.test(name)?ts.ScriptKind.TSX:
    /\.jsx$/i.test(name)?ts.ScriptKind.JSX:
    /\.(?:[cm]?js)$/i.test(name)?ts.ScriptKind.JS:ts.ScriptKind.TS;
}
function hasExport(node){
  return !!node.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword);
}
function isWriteCall(node){
  if(!ts.isCallExpression(node)||!ts.isPropertyAccessExpression(node.expression))return false;
  const prop=node.expression.name.text;
  if(!WRITE.has(prop))return false;
  // Only DB-like receivers, not arbitrary unrelated .update() calls.
  const call=node.expression.getText();
  return /\b(?:supabase|db|database|client|prisma|knex|pool)\b/.test(call) ||
    /\.from\s*\(/.test(call);
}
function guardReturn(node){
  let found=false;
  function visit(n){
    if(ts.isReturnStatement(n)||ts.isThrowStatement(n))found=true;
    if(ts.isFunctionLike(n))return;
    ts.forEachChild(n,visit);
  }
  visit(node);return found;
}
export function analyzeNextRouteAuth(filePath,content){
  if(!CODE.test(filePath))return {status:'unsupported',findings:[],handlers:0};
  if(Buffer.byteLength(content,'utf8')>1_000_000)throw Error('Auth route too large');
  const sf=ts.createSourceFile(filePath,content,ts.ScriptTarget.Latest,true,kind(filePath));
  if(sf.parseDiagnostics.length)return {status:'scan_incomplete',findings:[],handlers:0};
  const findings=[];let handlers=0,nodes=0;
  const candidates=[];
  for(const st of sf.statements){
    if(ts.isFunctionDeclaration(st)&&st.name&&hasExport(st)&&METHOD.has(st.name.text))
      candidates.push({name:st.name.text,body:st.body});
    if(ts.isVariableStatement(st)&&hasExport(st))
      for(const decl of st.declarationList.declarations){
        if(ts.isIdentifier(decl.name)&&METHOD.has(decl.name.text)&&decl.initializer&&
          (ts.isArrowFunction(decl.initializer)||ts.isFunctionExpression(decl.initializer)))
          candidates.push({name:decl.name.text,body:decl.initializer.body});
      }
  }
  for(const c of candidates){
    if(!c.body)continue;
    handlers++;
    const sourceVars=new Set(),guards=[],writes=[];
    function visit(n,depth=0){
      if(++nodes>MAX||depth>125)throw Error('Auth AST budget exceeded');
      if(ts.isVariableDeclaration(n)&&n.initializer){
        const value=n.initializer.getText(sf);
        if(AUTH_SOURCE.test(value)){
          if(ts.isIdentifier(n.name))sourceVars.add(n.name.text);
          else if(ts.isObjectBindingPattern(n.name)){
            for(const entry of n.name.elements)
              if(ts.isIdentifier(entry.name))sourceVars.add(entry.name.text);
          }
        }
      }
      if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&
        ['requireAuth','requireUser'].includes(n.expression.text))
        guards.push(n.getStart(sf));
      if(ts.isIfStatement(n)){
        const cond=n.expression.getText(sf);
        const denial=guardReturn(n.thenStatement);
        // Known auth result must be CHECKED and a deny path must return/throw.
        if(denial&&[...sourceVars].some(v=>
          new RegExp('!\\s*'+v+'\\b|'+v+'\\s*===?\\s*(?:null|undefined|false)').test(cond))){
          guards.push(n.getStart(sf));
        }
      }
      if(isWriteCall(n))writes.push(n.getStart(sf));
      ts.forEachChild(n,child=>visit(child,depth+1));
    }
    visit(c.body);
    for(const pos of writes){
      if(guards.some(g=>g<pos))continue;
      const line=sf.getLineAndCharacterOfPosition(pos).line+1;
      findings.push({
        id:'route-guard-'+filePath+'-'+c.name+'-'+line,
        ruleId:'nextjs_mutation_auth_unverified',severity:'High',
        title:'Next.js mutation route has no checked auth guard before a supported write',
        description:'No supported, explicitly checked authentication guard was identified before this database mutation. External middleware is not analyzed.',
        recommendation:'Verify the route rejects unauthenticated callers and enforces resource-level authorization; test both denial and permitted writes.',
        filePath,line,engine:'typescript_route_auth_preview',confidence:'medium',
        verification:'unverified',
      });
    }
  }
  return {status:'complete',findings,handlers,
    note:'Syntactic in-handler check only. External middleware, user permissions and row-level authorization not verified.'};
}
