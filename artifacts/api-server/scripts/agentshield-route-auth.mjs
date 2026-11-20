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
// Nested or conditional exits cannot establish a guaranteed denial path.
function guardReturn(node){
  if(ts.isReturnStatement(node)||ts.isThrowStatement(node))return true;
  if(ts.isBlock(node)){
    const statements=node.statements;
    return statements.length>0 && guardReturn(statements[statements.length-1]);
  }
  if(ts.isIfStatement(node)&&node.elseStatement)
    return guardReturn(node.thenStatement)&&guardReturn(node.elseStatement);
  return false;
}
// A guard inside an optional branch, loop or swallowed try/catch is not enough.
function isTopLevelStatement(statement,body){
  return ts.isBlock(body) && statement?.parent===body;
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
          // Supabase auth.getUser() returns {data:{user},error}; checking
          // the response object's truthiness never establishes a user.
          const wrapped=/\\bauth\\.getUser\\s*\\(/.test(value);
          if(ts.isIdentifier(n.name))
            sourceVars.add(wrapped?n.name.text+'.data.user':n.name.text);
          else if(ts.isObjectBindingPattern(n.name)){
            for(const entry of n.name.elements){
              if(!wrapped){
                if(ts.isIdentifier(entry.name))sourceVars.add(entry.name.text);
                continue;
              }
              const field=entry.propertyName?.getText(sf)||
                (ts.isIdentifier(entry.name)?entry.name.text:'');
              if(field!=='data')continue;
              if(ts.isIdentifier(entry.name))sourceVars.add(entry.name.text+'.user');
              else if(ts.isObjectBindingPattern(entry.name))
                for(const inner of entry.name.elements)
                  if(ts.isIdentifier(inner.name)&&
                     (inner.propertyName?.getText(sf)||inner.name.text)==='user')
                    sourceVars.add(inner.name.text);
            }
          }
        }
      }
      if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&
        ['requireAuth','requireUser'].includes(n.expression.text)) {
        // A returned authentication object is not evidence of enforcement.
        // Only treat a standalone guard statement as throwing/denying; when
        // assigned to a variable, require an explicit checked denial branch.
        const parent=n.parent;
        const direct=ts.isExpressionStatement(parent) ||
          (ts.isAwaitExpression(parent)&&ts.isExpressionStatement(parent.parent));
        const stmt=ts.isExpressionStatement(parent)?parent:
          (ts.isAwaitExpression(parent)&&ts.isExpressionStatement(parent.parent)?parent.parent:null);
        if(direct&&isTopLevelStatement(stmt,c.body))guards.push(n.getStart(sf));
      }
      if(ts.isIfStatement(n)){
        const cond=n.expression.getText(sf);
        const denial=guardReturn(n.thenStatement);
        // Known auth result must be CHECKED and a deny path must return/throw.
        if(isTopLevelStatement(n,c.body)&&denial&&[...sourceVars].some(v=>
          new RegExp('!\\s*'+v.replaceAll('.', '\\\\.')+'\\b|'+
            v.replaceAll('.', '\\\\.')+'\\s*===?\\s*(?:null|undefined|false)').test(cond))){
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
