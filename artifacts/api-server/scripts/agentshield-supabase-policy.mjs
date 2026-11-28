// Experimental Supabase/PostgreSQL SQL policy syntax checks. No DB connection.
// Regex-based, scoped to explicit statements; not a SQL parser or RLS proof.
// Only .sql source is analyzed; .sql.fixture is intentionally excluded.
const MAX_SOURCE=1_000_000;
const lineAt=(s,pos)=>s.slice(0,pos).split('\n').length;
function safeSql(s) {
  // Strip comments while preserving line breaks/offsets; quoted comment-like
  // strings are not a full SQL parse and may still require manual review.
  return s.replace(/\/\*[\s\S]*?\*\//g, m=>m.replace(/[^\n]/g,' '))
    .replace(/--[^\n]*/g,m=>' '.repeat(m.length));
}
export function analyzeSupabasePolicies(filePath,content) {
  if(!/\.sql$/i.test(filePath))return {status:'unsupported',findings:[]};
  if(typeof content!=='string'||Buffer.byteLength(content,'utf8')>MAX_SOURCE)
    throw Error('SQL policy source budget exceeded');
  const sql=safeSql(content),findings=[];
  function add(index,ruleId,severity,title,explanation) {
    if(findings.length>=50)throw Error('SQL policy finding limit exceeded');
    findings.push({
      id:ruleId+'-'+filePath+'-'+lineAt(sql,index),
      ruleId,severity,title,description:explanation,
      recommendation:'Confirm RLS, effective database grants and intended authenticated/anonymous access using an isolated database role test.',
      filePath,line:lineAt(sql,index),engine:'supabase_policy_syntax_preview',
      confidence:'medium',verification:'unverified',
    });
  }
  // Explicitly disabling RLS on a public table may expose rows when granted.
  for(const m of sql.matchAll(/\balter\s+table\s+(?:if\s+exists\s+)?(?:"?public"?\s*\.\s*)?"?([A-Za-z_]\w*)"?\s+disable\s+row\s+level\s+security\b/gi)) {
    add(m.index??0,'public_table_rls_disabled','Critical',
      'SQL explicitly disables row-level security',
      'A public-schema table has an explicit DISABLE ROW LEVEL SECURITY statement. Effective permissions and exposure must be reviewed.');
  }
  // Destructive owner-wide policies using tautologies. SELECT-only public
  // policies are intentionally NOT treated as vulnerabilities by this rule.
  for(const m of sql.matchAll(/\bcreate\s+policy\s+(?:"[^"]+"|'[^']+'|[A-Za-z_][\w]*)\s+on\s+(?:"?public"?\s*\.\s*)?"?([A-Za-z_]\w*)"?([\s\S]{0,1000}?)(?=;\s*|$)/gi)) {
    const rule=m[0], tail=m[2]||'';
    const mutation=/\bfor\s+(?:all|insert|update|delete)\b/i.test(tail);
    const openUsing=/\busing\s*\(\s*true\s*\)/i.test(tail);
    const openCheck=/\bwith\s+check\s*\(\s*true\s*\)/i.test(tail);
    const allowClients=/\bto\s+(?:public|anon|authenticated)\b/i.test(tail);
    if(mutation && allowClients && (openUsing||openCheck)) {
      add(m.index??0,'supabase_unrestricted_write_policy','High',
        'SQL policy may allow unrestricted client writes',
        'A client-facing write policy includes an unconditional true predicate. Row ownership and allowed operations require review.');
    }
  }
  return {status:'complete',findings,
    note:'SQL syntax heuristic only; assumes neither effective grants nor complete RLS policy state and does not certify SQL security.'};
}
