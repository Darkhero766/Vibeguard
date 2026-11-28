// Experimental read-only JS/TS AST analysis using TypeScript's parser.
// Pure syntax/data-flow checks; no project imports, scripts, typechecking, or code execution.
// Inputs are already selected by the AgentShield scanner and revalidated here.
import ts from 'typescript';
import { analyzeTaintedSql } from './agentshield-taint.mjs';
import { analyzeCrossFileSqlFlows } from './agentshield-crossfile.mjs';
import { analyzeNextRouteAuth } from './agentshield-route-auth.mjs';
import { analyzeSupabasePolicies } from './agentshield-supabase-policy.mjs';
import { lstat, realpath, readFile } from 'node:fs/promises';
import path from 'node:path';

const CODE = /\.(?:[cm]?[jt]sx?)$/i;
const SQL_START = /^\s*(?:select|insert|update|delete|with|replace)\b/i;
const SQL_METHODS = new Set(['query', 'execute', '$queryRawUnsafe', '$executeRawUnsafe']);
const MAX_FILE = 1_000_000;
const MAX_TOTAL = 8_000_000;
const MAX_NODES = 125_000;
const MAX_DEPTH = 140;
const MAX_FINDINGS = 100;

function scriptKind(file) {
  if (/\.tsx$/i.test(file)) return ts.ScriptKind.TSX;
  if (/\.jsx$/i.test(file)) return ts.ScriptKind.JSX;
  if (/\.(?:js|cjs|mjs)$/i.test(file)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}
function isLiteral(node) {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isNumericLiteral(node) || node.kind === ts.SyntaxKind.TrueKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword;
}
function unwrap(node) {
  while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) ||
    ts.isTypeAssertionExpression(node) || ts.isNonNullExpression(node) ||
    ts.isSatisfiesExpression(node))) node=node.expression;
  return node;
}
function expressionState(value, vars, depth=0) {
  if (!value || depth > 25) return { sql:false, dynamic:false, literal:false };
  const node=unwrap(value);
  if (isLiteral(node)) {
    const text = String(node.text ?? '');
    return { sql:SQL_START.test(text), dynamic:false, literal:true };
  }
  if (ts.isIdentifier(node)) {
    const stored=vars.get(node.text);
    return stored ? { ...stored } : { sql:false, dynamic:true, literal:false };
  }
  if (ts.isTemplateExpression(node)) {
    return { sql:SQL_START.test(node.head.text),
      dynamic:node.templateSpans.some(span=>!isLiteral(unwrap(span.expression))),
      literal:false };
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind===ts.SyntaxKind.PlusToken) {
    const left=expressionState(node.left,vars,depth+1);
    const right=expressionState(node.right,vars,depth+1);
    return { sql:left.sql || right.sql,
      dynamic:left.dynamic || right.dynamic,
      literal:left.literal && right.literal };
  }
  if (ts.isConditionalExpression(node)) {
    const yes=expressionState(node.whenTrue,vars,depth+1);
    const no=expressionState(node.whenFalse,vars,depth+1);
    return { sql:yes.sql || no.sql, dynamic:yes.dynamic || no.dynamic,
      literal:yes.literal && no.literal };
  }
  if (ts.isTemplateHead(node)) return { sql:SQL_START.test(node.text), dynamic:false, literal:true };
  return { sql:false, dynamic:true, literal:false };
}
function isSqlQueryCall(node) {
  if (!ts.isCallExpression(node) || !node.arguments.length) return false;
  const fn=unwrap(node.expression);
  return ts.isPropertyAccessExpression(fn) && SQL_METHODS.has(fn.name.text);
}
export function analyzeSource(filePath, content) {
  if (!CODE.test(filePath)) return { status:'unsupported', findings:[], parsed:false };
  if (Buffer.byteLength(content,'utf8') > MAX_FILE) throw new Error('AST file size exceeds budget.');
  const sf=ts.createSourceFile(filePath,content,ts.ScriptTarget.Latest,true,scriptKind(filePath));
  if (sf.parseDiagnostics.length) {
    return { status:'parse_incomplete', findings:[], parsed:false,
      note:'Syntax parser could not reliably inspect the file; do not report AST success.' };
  }
  const findings=[];
  let nodes=0;
  function walk(node, variables, depth=0) {
    if (++nodes > MAX_NODES || depth > MAX_DEPTH) throw new Error('AST node or recursion budget exceeded.');
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      // Flow is local and bounded to each function/block. This is not a whole-program proof.
      const state=expressionState(node.initializer,variables);
      variables.set(node.name.text,state);
    } else if (ts.isBinaryExpression(node) &&
      node.operatorToken.kind===ts.SyntaxKind.EqualsToken && ts.isIdentifier(node.left)) {
      variables.set(node.left.text,expressionState(node.right,variables));
    }
    if (isSqlQueryCall(node)) {
      const argument=expressionState(node.arguments[0],variables);
      if (argument.sql && argument.dynamic) {
        const line=sf.getLineAndCharacterOfPosition(node.getStart(sf)).line+1;
        if (findings.length >= MAX_FINDINGS) throw new Error('AST findings budget exceeded.');
        findings.push({
          id:'ast-sql-dataflow-'+filePath+'-'+line,
          ruleId:'unsafe_sql_dataflow', severity:'High',
          title:'Potential SQL injection through a constructed query',
          description:'Local syntax analysis found nonliteral content in an SQL string passed to a query sink. Input trust and query-builder semantics require review.',
          recommendation:'Use parameterized queries with bound values; verify SQL authorization and database behavior independently.',
          filePath, line, engine:'typescript_ast_local',
          confidence:'medium', verification:'unverified',
        });
      }
    }
    if (ts.isFunctionLike(node) && node.body) {
      // Do not import code or treat outer declarations as trusted sanitizers.
      const inner = new Map(variables);
      ts.forEachChild(node,child=>walk(child,inner,depth+1));
      return;
    }
    if (ts.isBlock(node) || ts.isSourceFile(node)) {
      const blockScope=ts.isSourceFile(node)?variables:new Map(variables);
      ts.forEachChild(node,child=>walk(child,blockScope,depth+1));
      return;
    }
    if (ts.isIfStatement(node) || ts.isConditionalExpression(node)) {
      ts.forEachChild(node,child=>walk(child,new Map(variables),depth+1));
      return;
    }
    ts.forEachChild(node,child=>walk(child,variables,depth+1));
  }
  walk(sf,new Map());
  return { status:'complete', findings, parsed:true, visitedNodes:nodes };
}
export async function analyzeRepositoryPaths(root, selectedPaths) {
  if (!Array.isArray(selectedPaths) || selectedPaths.length > 100) throw new Error('AST file count exceeds budget.');
  const rootReal=await realpath(root);
  let total=0, analyzed=0, sqlFilesAnalyzed=0, nodes=0, ignored=0;
  const findings=[], taintFindings=[], routeAuthFindings=[], sqlPolicyFindings=[], incomplete=[], codeInputs=[];
  const unique=[...new Set(selectedPaths)];
  if (unique.length !== selectedPaths.length) throw new Error('Duplicate scanner coverage paths.');
  for (const rel of unique) {
    if (typeof rel !== 'string' || !rel || rel.includes('\0') || path.isAbsolute(rel) ||
      rel.replaceAll('\\','/').split('/').some(part=>part==='..' || part==='.git')) {
      throw new Error('AST received an invalid relative path.');
    }
    if (!CODE.test(rel) && !/\.sql$/i.test(rel)) { ignored++; continue; }
    const full=path.resolve(rootReal,rel);
    const suffix=path.relative(rootReal,full);
    if (!suffix || suffix.startsWith('..'+path.sep) || path.isAbsolute(suffix)) throw new Error('Unsafe AST path.');
    const stat=await lstat(full);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size>MAX_FILE) throw new Error('AST file is unsafe or oversized.');
    const resolved=await realpath(full);
    if (resolved!==full || !resolved.startsWith(rootReal+path.sep)) throw new Error('AST file escaped repository.');
    const buf=await readFile(full);
    total+=buf.length;
    if (buf.length>MAX_FILE || total>MAX_TOTAL) throw new Error('AST source budget exceeded.');
    const source=buf.toString('utf8');
    if(/\.sql$/i.test(rel)) {
      const policy=analyzeSupabasePolicies(rel,source);
      if(policy.status!=='complete') throw Error('SQL policy scan did not complete');
      sqlFilesAnalyzed++;
      sqlPolicyFindings.push(...policy.findings);
      if(sqlPolicyFindings.length>MAX_FINDINGS) throw Error('SQL policy finding budget exceeded');
      continue;
    }
    const result=analyzeSource(rel,source);
    if (result.status==='parse_incomplete') incomplete.push(rel);
    else {
      const taint = analyzeTaintedSql(rel, buf.toString('utf8'));
      if (taint.status !== 'complete') throw new Error('Taint parser was incomplete.');
      const routeAuth=analyzeNextRouteAuth(rel,source);
      if(routeAuth.status==='scan_incomplete') throw Error('Route auth parser incomplete');
      routeAuthFindings.push(...routeAuth.findings);
      analyzed++; nodes+=result.visitedNodes + taint.visitedNodes;
      codeInputs.push({path:rel,content:source});
      findings.push(...result.findings);
      taintFindings.push(...taint.findings);
    }
    if (findings.length>MAX_FINDINGS || taintFindings.length>MAX_FINDINGS || routeAuthFindings.length>MAX_FINDINGS)
      throw new Error('AST or taint findings count exceeded.');
  }
  const crossFile=analyzeCrossFileSqlFlows(codeInputs);
  if(crossFile.status!=='complete') throw Error('Cross-file analysis failed safely.');
  return {
    status:incomplete.length?'scan_incomplete':'complete',
    filesAnalyzed:analyzed, codeFilesExpected:analyzed+incomplete.length,
    unsupportedFilesSkipped:ignored, sqlFilesAnalyzed, visitedNodes:nodes+crossFile.visitedNodes,
    findings, taintFindings, routeAuthFindings, sqlPolicyFindings, crossFileFindings:crossFile.findings,
    crossFileCoverage:'changed_files_only',
    incompletePaths:incomplete.slice(0,20),
    note:'Selected SQL mutation policies, JS/TS taint, one-hop changed-file imports and Next.js auth heuristics. Not complete policy state, authorization, or exploit proof.',
  };
}
