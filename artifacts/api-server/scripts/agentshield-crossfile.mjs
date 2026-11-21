// Experimental one-hop, changed-file-only TypeScript data-flow analysis.
// Resolves *named relative imports* without loading or executing project code.
// No interprocedural recursion, npm resolution, alias maps, or exploit proofs.
import ts from 'typescript';
import path from 'node:path';

const CODE=/\.(?:[cm]?[jt]sx?)$/i;
const SQL_START=/^\s*(?:select|with|insert|update|delete|replace)\b/i;
const SINKS=new Set(['query','execute','raw','$queryRawUnsafe','$executeRawUnsafe']);
const MAX_FILES=100, MAX_BYTES=8_000_000, MAX_NODES=120_000, MAX_FINDINGS=80;
const empty=()=>({sql:false, indices:new Set(), fromRequest:false});
const combine=(a,b)=>({
  sql:a.sql||b.sql,
  indices:new Set([...a.indices,...b.indices]),
  fromRequest:a.fromRequest||b.fromRequest,
});
function unwrap(node){
  while(node&&(ts.isParenthesizedExpression(node)||ts.isAsExpression(node)||
    ts.isTypeAssertionExpression(node)||ts.isSatisfiesExpression(node)||
    ts.isNonNullExpression(node)||ts.isAwaitExpression(node)))node=node.expression;
  return node;
}
function isSink(node){
  if(!ts.isCallExpression(node)||!node.arguments.length)return false;
  const e=unwrap(node.expression);
  if(!ts.isPropertyAccessExpression(e)||!SINKS.has(e.name.text))return false;
  if(e.name.text.startsWith('$'))return true;
  const owner=e.expression.getText();
  return /^(?:db|pool|client|conn|connection|database|sequelize|knex)(?:\b|\.|\[)/i.test(owner);
}
function status(node,vars,paramIndex,depth=0){
  if(!node||depth>25)return empty();
  const n=unwrap(node);
  if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n))
    return {sql:SQL_START.test(n.text),indices:new Set(),fromRequest:false};
  if(ts.isIdentifier(n)){
    if(vars.has(n.text))return vars.get(n.text);
    const idx=paramIndex.get(n.text);
    return idx===undefined?empty():{sql:false,indices:new Set([idx]),fromRequest:false};
  }
  if(ts.isTemplateExpression(n)){
    let v={sql:SQL_START.test(n.head.text),indices:new Set(),fromRequest:false};
    for(const span of n.templateSpans)v=combine(v,status(span.expression,vars,paramIndex,depth+1));
    return v;
  }
  if(ts.isBinaryExpression(n)&&n.operatorToken.kind===ts.SyntaxKind.PlusToken)
    return combine(status(n.left,vars,paramIndex,depth+1),status(n.right,vars,paramIndex,depth+1));
  if(ts.isConditionalExpression(n))return combine(
    status(n.whenTrue,vars,paramIndex,depth+1),status(n.whenFalse,vars,paramIndex,depth+1));
  if(ts.isPropertyAccessExpression(n)||ts.isElementAccessExpression(n))
    return status(n.expression,vars,paramIndex,depth+1);
  if(ts.isCallExpression(n)){
    if(ts.isIdentifier(n.expression)&&['Number','BigInt','parseInt','parseFloat'].includes(n.expression.text))return empty();
    let v=ts.isPropertyAccessExpression(n.expression)?
      status(n.expression.expression,vars,paramIndex,depth+1):empty();
    for(const a of n.arguments)v=combine(v,status(a,vars,paramIndex,depth+1));
    return v;
  }
  if(ts.isObjectLiteralExpression(n)){
    const textField=n.properties.find(p=>ts.isPropertyAssignment(p)&&p.name.getText()==='text');
    if(textField&&ts.isPropertyAssignment(textField))
      return status(textField.initializer,vars,paramIndex,depth+1);
  }
  return empty();
}
function summarize(fn,sourceFile,budget) {
  if(!fn.body)return [];
  const paramIndex=new Map();
  fn.parameters.forEach((p,i)=>{if(ts.isIdentifier(p.name))paramIndex.set(p.name.text,i);});
  const vulnerableParams=new Set();
  function walk(node,scope,depth=0) {
    if(++budget.nodes>MAX_NODES||depth>100)throw Error('Cross-file AST budget exceeded.');
    if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.initializer)
      scope.set(node.name.text,status(node.initializer,scope,paramIndex));
    if(ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.EqualsToken&&ts.isIdentifier(node.left))
      scope.set(node.left.text,status(node.right,scope,paramIndex));
    if(isSink(node)){
      const v=status(node.arguments[0],scope,paramIndex);
      if(v.sql||v.indices.size>0){
        for(const index of v.indices)vulnerableParams.add(index);
      }
    }
    // Do not summarize unrelated nested functions as if part of this helper.
    if(ts.isFunctionLike(node)&&node!==fn)return;
    if(ts.isBlock(node)){const scoped=new Map(scope);ts.forEachChild(node,c=>walk(c,scoped,depth+1));return;}
    ts.forEachChild(node,c=>walk(c,scope,depth+1));
  }
  walk(fn.body,new Map());
  return [...vulnerableParams];
}
function kind(name){
  return /\.tsx$/i.test(name)?ts.ScriptKind.TSX:
    /\.jsx$/i.test(name)?ts.ScriptKind.JSX:
    /\.(?:[cm]?js)$/i.test(name)?ts.ScriptKind.JS:ts.ScriptKind.TS;
}
function parseModules(files,budget){
  const modules=new Map();
  for(const file of files){
    if(!CODE.test(file.path))continue;
    const sf=ts.createSourceFile(file.path,file.content,ts.ScriptTarget.Latest,true,kind(file.path));
    if(sf.parseDiagnostics.length)throw Error('Cross-file parse incomplete.');
    const exported=new Map(), imports=new Map();
    for(const n of sf.statements){
      const isExport=n.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword);
      if(isExport&&ts.isFunctionDeclaration(n)){
        const summary=summarize(n,sf,budget);
        if(n.name)exported.set(n.name.text,summary);
        if(n.modifiers?.some(m=>m.kind===ts.SyntaxKind.DefaultKeyword))
          exported.set('default',summary);
      }
      if(isExport&&ts.isVariableStatement(n)){
        for(const d of n.declarationList.declarations)
          if(ts.isIdentifier(d.name)&&d.initializer&&
            (ts.isArrowFunction(d.initializer)||ts.isFunctionExpression(d.initializer)))
            exported.set(d.name.text,summarize(d.initializer,sf,budget));
      }
      if(ts.isImportDeclaration(n)&&ts.isStringLiteral(n.moduleSpecifier)&&n.importClause){
        const spec=n.moduleSpecifier.text;
        if(!spec.startsWith('.'))continue;
        if(n.importClause.name)
          imports.set(n.importClause.name.text,{source:spec,exportName:'default'});
        if(n.importClause.namedBindings&&ts.isNamedImports(n.importClause.namedBindings))
          for(const e of n.importClause.namedBindings.elements)
            imports.set(e.name.text,{source:spec,exportName:e.propertyName?.text||e.name.text});
      }
    }
    modules.set(file.path,{sf,exported,imports});
  }
  return modules;
}
function importedPath(name,spec,modules){
  if(!spec.startsWith('./')&&!spec.startsWith('../'))return null;
  const base=path.posix.normalize(path.posix.join(path.posix.dirname(name),spec));
  if(base.startsWith('../')||path.posix.isAbsolute(base))return null;
  for(const c of [base,base+'.ts',base+'.tsx',base+'.js',base+'.jsx',base+'.mts',base+'.cts',base+'/index.ts',base+'/index.tsx']){
    if(modules.has(c))return c;
  }
  return null;
}
function isRequestValue(node,env,depth=0){
  if(!node||depth>20)return false;
  const n=unwrap(node);
  if(ts.isIdentifier(n))return !!env.get(n.text);
  if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n)||
     ts.isNumericLiteral(n))return false;
  const expr=n.getText();
  if(/^(?:req|request|ctx\.request|context\.req)\.(?:body|query|params|headers|cookies|nextUrl|url)\b/.test(expr) ||
     /^(?:req|request)\.(?:json|text|formData)\s*\(/.test(expr))return true;
  if(ts.isPropertyAccessExpression(n)||ts.isElementAccessExpression(n))
    return isRequestValue(n.expression,env,depth+1);
  if(ts.isCallExpression(n)){
    if(ts.isIdentifier(n.expression)&&['Number','BigInt','parseInt','parseFloat'].includes(n.expression.text))return false;
    return (ts.isPropertyAccessExpression(n.expression)&&isRequestValue(n.expression.expression,env,depth+1))||
      n.arguments.some(x=>isRequestValue(x,env,depth+1));
  }
  if(ts.isBinaryExpression(n))return isRequestValue(n.left,env,depth+1)||isRequestValue(n.right,env,depth+1);
  if(ts.isTemplateExpression(n))return n.templateSpans.some(x=>isRequestValue(x.expression,env,depth+1));
  return false;
}
export function analyzeCrossFileSqlFlows(files){
  if(!Array.isArray(files)||files.length>MAX_FILES)throw Error('Cross-file selection budget exceeded');
  let bytes=0;
  for(const f of files){
    if(typeof f?.path!=='string'||typeof f?.content!=='string'||
      path.posix.isAbsolute(f.path)||f.path.split('/').some(p=>p==='..'))throw Error('Invalid cross-file input');
    bytes+=Buffer.byteLength(f.content,'utf8');
  }
  if(bytes>MAX_BYTES)throw Error('Cross-file source size exceeded');
  const budget={nodes:0};
  const modules=parseModules(files,budget),findings=[];
  for(const [filePath,module] of modules){
    const resolved=new Map();
    for(const [alias,info] of module.imports){
      const target=importedPath(filePath,info.source,modules);
      if(!target)continue;
      const vulnerable=modules.get(target).exported.get(info.exportName);
      if(vulnerable?.length)resolved.set(alias,{target,parameters:vulnerable});
    }
    if(!resolved.size)continue;
    function walk(node,env,depth=0){
      if(++budget.nodes>MAX_NODES||depth>100)throw Error('Cross-file scan node budget exceeded');
      if(ts.isVariableDeclaration(node)&&node.initializer){
        const tainted=isRequestValue(node.initializer,env);
        if(ts.isIdentifier(node.name))env.set(node.name.text,tainted);
        else if(ts.isObjectBindingPattern(node.name)||ts.isArrayBindingPattern(node.name))
          for(const b of node.name.elements)
            if(ts.isBindingElement(b)&&ts.isIdentifier(b.name))env.set(b.name.text,tainted);
      }
      if(ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.EqualsToken&&ts.isIdentifier(node.left))
        env.set(node.left.text,isRequestValue(node.right,env));
      if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&resolved.has(node.expression.text)){
        const helper=resolved.get(node.expression.text);
        if(helper.parameters.some(idx=>node.arguments[idx]&&isRequestValue(node.arguments[idx],env))){
          const line=module.sf.getLineAndCharacterOfPosition(node.getStart(module.sf)).line+1;
          if(findings.length>=MAX_FINDINGS)throw Error('Cross-file findings budget exceeded');
          findings.push({
            id:'cross-file-sql-'+filePath+'-'+line,
            ruleId:'cross_file_tainted_sql',severity:'High',
            title:'Request input may reach unsafe SQL in a changed-file helper',
            description:'A selected changed file imports a local helper with a raw SQL parameter flow. Verify authorization, sanitization and query binding.',
            recommendation:'Use bound SQL parameters in the helper; test both the route and database behavior.',
            filePath,line,relatedHelper:helper.target,
            confidence:'medium',verification:'unverified',
            engine:'typescript_cross_file_preview',
          });
        }
      }
      if(ts.isFunctionLike(node)){
        const inner=new Map(env);
        ts.forEachChild(node,c=>walk(c,inner,depth+1));return;
      }
      if(ts.isBlock(node)){
        const scoped=new Map(env);
        ts.forEachChild(node,c=>walk(c,scoped,depth+1));return;
      }
      ts.forEachChild(node,c=>walk(c,env,depth+1));
    }
    walk(module.sf,new Map());
  }
  return {
    status:'complete',filesAnalyzed:modules.size,visitedNodes:budget.nodes,findings,
    note:'One-hop named relative imports in the selected changed files only. No source beyond the changed-file set, npm resolution, dynamic import, framework middleware or full-program proof.',
  };
}
