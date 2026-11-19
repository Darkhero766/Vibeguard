// Experimental, bounded, intra-file TypeScript/JavaScript taint analysis.
// No project execution or imports. Only known request sources and SQL sinks.
// This is NOT whole-program data-flow or proof that a SQL injection is exploitable.
import ts from 'typescript';

const MAX_BYTES = 1_000_000;
const MAX_NODES = 125_000;
const MAX_DEPTH = 120;
const MAX_FINDINGS = 60;
const CODE = /\.(?:[cm]?[jt]sx?)$/i;
const QUERY_METHODS = new Set(['query','execute','$queryRawUnsafe','$executeRawUnsafe']);
const SOURCE_ROOTS = new Set(['req','request']);
const SQL_PATTERN = /^\s*(?:select|insert|update|delete|replace|with)\b/i;
const SAFE_NUMBER_CASTS = new Set(['Number','BigInt','parseInt','parseFloat']);
const safe = () => ({ tainted:false, sql:false, sources:[] });
const unique = (...items) => [...new Set(items.flat())].slice(0,6);
const combine = (a,b) => ({
  tainted:a.tainted || b.tainted,sql:a.sql || b.sql,
  sources:unique(a.sources,b.sources),
});
function unwrapped(node) {
  while(node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) ||
    ts.isTypeAssertionExpression(node) || ts.isNonNullExpression(node) ||
    ts.isSatisfiesExpression(node) || ts.isAwaitExpression(node))) node=node.expression;
  return node;
}
function sourceLabel(node) {
  if (!node) return null;
  const s=node.getText();
  if (/^(?:req|request|ctx\.request|context\.(?:req|request))\.(?:query|body|params|headers|cookies|nextUrl|url)(?:\b|\.|\[)/.test(s)) {
    return 'http_request';
  }
  if (/^(?:req|request)\.(?:json|text|formData)\s*\(/.test(s)) return 'http_request_body';
  if (/^(?:window\.)?(?:location\.search|location\.hash)/.test(s)) return 'browser_input';
  return null;
}
function tainted(label) {return {tainted:true,sql:false,sources:[label]};}
function querySink(node) {
  if (!ts.isCallExpression(node)) return false;
  const expr=unwrapped(node.expression);
  if (!ts.isPropertyAccessExpression(expr) || !QUERY_METHODS.has(expr.name.text)) return false;
  if (expr.name.text.startsWith('
  // Narrow heuristic to well-known DB handles, not arbitrary .query methods.
  const parent=expr.expression.getText();
  return /^(?:db|pool|client|conn|connection|database|sqlClient|pgClient|sequelize)(?:\b|\.|\[)/i.test(parent);
}
function kindFor(path) {
  if (/\.tsx$/i.test(path)) return ts.ScriptKind.TSX;
  if (/\.jsx$/i.test(path)) return ts.ScriptKind.JSX;
  if (/\.(?:c|m)?js$/i.test(path)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}
export function analyzeTaintedSql(filePath, content) {
  if (!CODE.test(filePath)) return {status:'unsupported', findings:[], visitedNodes:0};
  if(Buffer.byteLength(content,'utf8') > MAX_BYTES) throw Error('Taint source budget exceeded.');
  const sf=ts.createSourceFile(filePath,content,ts.ScriptTarget.Latest,true,kindFor(filePath));
  if (sf.parseDiagnostics.length) return {
    status:'parse_incomplete',findings:[],visitedNodes:0,
    note:'Invalid TypeScript syntax; no taint analysis pass may be claimed.',
  };
  let count=0;
  const findings=[];
  function evalExpr(input, env, depth=0) {
    if(!input || depth>25) return safe();
    const n=unwrapped(input);
    if(!n) return safe();
    const label=sourceLabel(n);
    if(label) return tainted(label);
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n))
      return {tainted:false,sql:SQL_PATTERN.test(n.text),sources:[]};
    if (ts.isNumericLiteral(n) || n.kind===ts.SyntaxKind.TrueKeyword || n.kind===ts.SyntaxKind.FalseKeyword)
      return safe();
    if(ts.isIdentifier(n)) return env.get(n.text) || safe();
    if(ts.isTemplateExpression(n)){
      let r={tainted:false,sql:SQL_PATTERN.test(n.head.text),sources:[]};
      for(const span of n.templateSpans) r=combine(r,evalExpr(span.expression,env,depth+1));
      return r;
    }
    if(ts.isBinaryExpression(n)){
      if(n.operatorToken.kind===ts.SyntaxKind.PlusToken)
        return combine(evalExpr(n.left,env,depth+1),evalExpr(n.right,env,depth+1));
      if(n.operatorToken.kind===ts.SyntaxKind.EqualsToken)
        return evalExpr(n.right,env,depth+1);
      return safe();
    }
    if(ts.isConditionalExpression(n)){
      return combine(evalExpr(n.whenTrue,env,depth+1),evalExpr(n.whenFalse,env,depth+1));
    }
    if(ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n)) {
      const owner=ts.isPropertyAccessExpression(n)?n.expression:n.expression;
      return evalExpr(owner,env,depth+1);
    }
    if(ts.isNewExpression(n)){
      let result=safe();
      for(const arg of n.arguments || []) result=combine(result,evalExpr(arg,env,depth+1));
      return result;
    }
    if(ts.isCallExpression(n)){
      const fn=unwrapped(n.expression);
      const functionName=ts.isIdentifier(fn)?fn.text:'';
      if(SAFE_NUMBER_CASTS.has(functionName)) {
        // Numeric conversion cannot preserve arbitrary SQL control tokens.
        // This is not a general authorization or numeric-validation guarantee.
        return safe();
      }
      if(ts.isPropertyAccessExpression(fn) && fn.name.text==='toString') {
        return evalExpr(fn.expression,env,depth+1);
      }
      // Unrecognized transformations are NOT trusted sanitizers.
      let result=safe();
      for(const arg of n.arguments) result=combine(result,evalExpr(arg,env,depth+1));
      // Query string access from a parsed request URL remains untrusted even
      // when the searchParams object is assigned to a local variable.
      if(ts.isPropertyAccessExpression(fn) && ['get','getAll'].includes(fn.name.text) &&
        /searchParams/.test(fn.expression.getText())) {
        result=combine(result,evalExpr(fn.expression,env,depth+1));
      }
      return result;
    }
    if(ts.isArrayLiteralExpression(n)){
      return n.elements.reduce((a,b)=>combine(a,evalExpr(b,env,depth+1)),safe());
    }
    if(ts.isObjectLiteralExpression(n)){
      return n.properties.reduce((a,p)=>{
        if(ts.isPropertyAssignment(p)) return combine(a,evalExpr(p.initializer,env,depth+1));
        return a;
      },safe());
    }
    return safe();
  }
  function walk(node,env,depth=0) {
    if(++count>MAX_NODES || depth>MAX_DEPTH) throw Error('Taint analysis exceeded AST resource budget.');
    if(ts.isVariableDeclaration(node) && node.initializer){
      const v=evalExpr(node.initializer,env);
      if(ts.isIdentifier(node.name)) env.set(node.name.text,v);
      else if(ts.isObjectBindingPattern(node.name)){
        for(const binding of node.name.elements){
          if(ts.isIdentifier(binding.name)) env.set(binding.name.text,v);
        }
      }
    }
    if(ts.isBinaryExpression(node) &&
      node.operatorToken.kind===ts.SyntaxKind.EqualsToken && ts.isIdentifier(node.left)) {
      env.set(node.left.text,evalExpr(node.right,env));
    }
    if(querySink(node) && node.arguments.length) {
      const arg=evalExpr(node.arguments[0],env);
      if(arg.tainted) {
        if(findings.length>=MAX_FINDINGS) throw Error('Too many taint findings.');
        const line=sf.getLineAndCharacterOfPosition(node.getStart(sf)).line+1;
        findings.push({
          id:'taint-sql-'+filePath+'-'+line,ruleId:'tainted_sql_sink',severity:'High',
          title:'Untrusted request data reaches a dynamic SQL sink',
          description:'A recognized request input may flow into a SQL query argument without proven parameterization. Review SQL input handling.',
          recommendation:'Use bound SQL parameters instead of interpolating or concatenating request values; verify behavior with an independent test.',
          filePath,line,sourceCategories:arg.sources,
          confidence:arg.sql?'high':'medium',engine:'typescript_taint_preview',
          verification:'unverified',
        });
      }
    }
    if(ts.isFunctionLike(node) && node.body){
      const inner=new Map(env);
      ts.forEachChild(node,c=>walk(c,inner,depth+1));
      return;
    }
    if(ts.isBlock(node)){
      const inner=new Map(env);
      ts.forEachChild(node,c=>walk(c,inner,depth+1));
      return;
    }
    if(ts.isIfStatement(node)||ts.isConditionalExpression(node)){
      ts.forEachChild(node,c=>walk(c,new Map(env),depth+1));
      return;
    }
    ts.forEachChild(node,c=>walk(c,env,depth+1));
  }
  walk(sf,new Map());
  return {
    status:'complete',visitedNodes:count,findings,
    note:'Recognized request-source to SQL-sink flows, intrafile only; no interprocedural, sanitizer or exploitability proof.',
  };
}
)) return true;
  if (expr.name.text==='raw' && /^(?:knex|database|db)(?:\b|\.|\[)/i.test(expr.expression.getText())) return true;
  // Narrow heuristic to well-known DB handles, not arbitrary .query methods.
  const parent=expr.expression.getText();
  return /^(?:db|pool|client|conn|connection|database|sqlClient|pgClient)(?:\b|\.|\[)/i.test(parent);
}
function kindFor(path) {
  if (/\.tsx$/i.test(path)) return ts.ScriptKind.TSX;
  if (/\.jsx$/i.test(path)) return ts.ScriptKind.JSX;
  if (/\.(?:c|m)?js$/i.test(path)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}
export function analyzeTaintedSql(filePath, content) {
  if (!CODE.test(filePath)) return {status:'unsupported', findings:[], visitedNodes:0};
  if(Buffer.byteLength(content,'utf8') > MAX_BYTES) throw Error('Taint source budget exceeded.');
  const sf=ts.createSourceFile(filePath,content,ts.ScriptTarget.Latest,true,kindFor(filePath));
  if (sf.parseDiagnostics.length) return {
    status:'parse_incomplete',findings:[],visitedNodes:0,
    note:'Invalid TypeScript syntax; no taint analysis pass may be claimed.',
  };
  let count=0;
  const findings=[];
  function evalExpr(input, env, depth=0) {
    if(!input || depth>25) return safe();
    const n=unwrapped(input);
    if(!n) return safe();
    const label=sourceLabel(n);
    if(label) return tainted(label);
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n))
      return {tainted:false,sql:SQL_PATTERN.test(n.text),sources:[]};
    if (ts.isNumericLiteral(n) || n.kind===ts.SyntaxKind.TrueKeyword || n.kind===ts.SyntaxKind.FalseKeyword)
      return safe();
    if(ts.isIdentifier(n)) return env.get(n.text) || safe();
    if(ts.isTemplateExpression(n)){
      let r={tainted:false,sql:SQL_PATTERN.test(n.head.text),sources:[]};
      for(const span of n.templateSpans) r=combine(r,evalExpr(span.expression,env,depth+1));
      return r;
    }
    if(ts.isBinaryExpression(n)){
      if(n.operatorToken.kind===ts.SyntaxKind.PlusToken)
        return combine(evalExpr(n.left,env,depth+1),evalExpr(n.right,env,depth+1));
      if(n.operatorToken.kind===ts.SyntaxKind.EqualsToken)
        return evalExpr(n.right,env,depth+1);
      return safe();
    }
    if(ts.isConditionalExpression(n)){
      return combine(evalExpr(n.whenTrue,env,depth+1),evalExpr(n.whenFalse,env,depth+1));
    }
    if(ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n)) {
      const owner=ts.isPropertyAccessExpression(n)?n.expression:n.expression;
      return evalExpr(owner,env,depth+1);
    }
    if(ts.isCallExpression(n)){
      const fn=unwrapped(n.expression);
      const functionName=ts.isIdentifier(fn)?fn.text:'';
      if(SAFE_NUMBER_CASTS.has(functionName)) {
        // Numeric conversion cannot preserve arbitrary SQL control tokens.
        // This is not a general authorization or numeric-validation guarantee.
        return safe();
      }
      if(ts.isPropertyAccessExpression(fn) && fn.name.text==='toString') {
        return evalExpr(fn.expression,env,depth+1);
      }
      // Unrecognized transformations are NOT trusted sanitizers.
      let result=safe();
      for(const arg of n.arguments) result=combine(result,evalExpr(arg,env,depth+1));
      return result;
    }
    if(ts.isArrayLiteralExpression(n)){
      return n.elements.reduce((a,b)=>combine(a,evalExpr(b,env,depth+1)),safe());
    }
    if(ts.isObjectLiteralExpression(n)){
      return n.properties.reduce((a,p)=>{
        if(ts.isPropertyAssignment(p)) return combine(a,evalExpr(p.initializer,env,depth+1));
        return a;
      },safe());
    }
    return safe();
  }
  function walk(node,env,depth=0) {
    if(++count>MAX_NODES || depth>MAX_DEPTH) throw Error('Taint analysis exceeded AST resource budget.');
    if(ts.isVariableDeclaration(node) && node.initializer){
      const v=evalExpr(node.initializer,env);
      if(ts.isIdentifier(node.name)) env.set(node.name.text,v);
      else if(ts.isObjectBindingPattern(node.name)){
        for(const binding of node.name.elements){
          if(ts.isIdentifier(binding.name)) env.set(binding.name.text,v);
        }
      }
    }
    if(ts.isBinaryExpression(node) &&
      node.operatorToken.kind===ts.SyntaxKind.EqualsToken && ts.isIdentifier(node.left)) {
      env.set(node.left.text,evalExpr(node.right,env));
    }
    if(querySink(node) && node.arguments.length) {
      const arg=evalExpr(node.arguments[0],env);
      if(arg.tainted) {
        if(findings.length>=MAX_FINDINGS) throw Error('Too many taint findings.');
        const line=sf.getLineAndCharacterOfPosition(node.getStart(sf)).line+1;
        findings.push({
          id:'taint-sql-'+filePath+'-'+line,ruleId:'tainted_sql_sink',severity:'High',
          title:'Untrusted request data reaches a dynamic SQL sink',
          description:'A recognized request input may flow into a SQL query argument without proven parameterization. Review SQL input handling.',
          recommendation:'Use bound SQL parameters instead of interpolating or concatenating request values; verify behavior with an independent test.',
          filePath,line,sourceCategories:arg.sources,
          confidence:arg.sql?'high':'medium',engine:'typescript_taint_preview',
          verification:'unverified',
        });
      }
    }
    if(ts.isFunctionLike(node) && node.body){
      const inner=new Map(env);
      ts.forEachChild(node,c=>walk(c,inner,depth+1));
      return;
    }
    if(ts.isBlock(node)){
      const inner=new Map(env);
      ts.forEachChild(node,c=>walk(c,inner,depth+1));
      return;
    }
    if(ts.isIfStatement(node)||ts.isConditionalExpression(node)){
      ts.forEachChild(node,c=>walk(c,new Map(env),depth+1));
      return;
    }
    ts.forEachChild(node,c=>walk(c,env,depth+1));
  }
  walk(sf,new Map());
  return {
    status:'complete',visitedNodes:count,findings,
    note:'Recognized request-source to SQL-sink flows, intrafile only; no interprocedural, sanitizer or exploitability proof.',
  };
}
