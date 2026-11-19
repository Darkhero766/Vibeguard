#!/usr/bin/env node
// Accurate public capability registry. Reading a file is not equivalent to
// performing a language-aware security assessment. No network or source input.
export const CAPABILITIES = Object.freeze({
  schemaVersion:1,
  product:'VibeSane AgentShield',
  securityGuarantee:false,
  staticScanner:{
    status:'implemented',
    codeLanguages:[
      {name:'JavaScript',extensions:['.js','.jsx','.mjs','.cjs'],coverage:'supported_heuristics',
        checks:['secrets','API authentication heuristics','unsafe SQL interpolation','selected client-side privileged key usage']},
      {name:'TypeScript',extensions:['.ts','.tsx','.mts','.cts'],coverage:'supported_heuristics',
        checks:['secrets','API authentication heuristics','unsafe SQL interpolation','selected client-side privileged key usage']},
      {name:'SQL',extensions:['.sql'],coverage:'supported_heuristics',
        checks:['Supabase RLS patterns','some policy/grant patterns']},
    ],
    configurationFormats:[
      {name:'JSON',extensions:['.json'],coverage:'pattern_based_partial'},
      {name:'YAML',extensions:['.yaml','.yml'],coverage:'pattern_based_partial'},
      {name:'Environment files',extensions:['.env','.env.*'],coverage:'pattern_based_partial'},
    ],
    unsupportedDedicatedSast:['Python','Go','Java','Rust','C#','C','C++','PHP','Ruby','Kotlin','Swift'],
    note:'Other languages may be read by the GitHub web crawler but do not have proven language-specific static analysis.',
  },
  experimentalAst:{
    status:'opt_in_beta_package_supported',
    languages:['JavaScript','TypeScript','JSX','TSX'],
    analyses:['intra-file constructed SQL string detection','selected request-input-to-SQL-sink taint','one-hop named relative imports among selected changed files','Next.js mutation route checked-auth heuristics'],
    excludes:['arbitrary cross-file or interprocedural flow','complete sanitizer modeling','full authorization verification','proof of exploitability'],
    shippingNote:'Bundled in unpublished 0.7.0-beta.1 hybrid beta; opt-in only, not in default Claude Code Stop gate.',
  },
  ai:{
    status:'opt_in_local_advisory_only',
    sendsToLocalModel:['sanitized rule ID','severity'],
    doesNotSend:['source code','file paths','credentials','transcripts'],
    cannot:['change static verdict','suppress a finding','verify a security fix','execute remediation'],
    testStatus:'mocked local API only; real model inference not validated',
  },
  caution:'No findings means no supported risks were detected in the scanned subset; it does not guarantee security.',
});
export function printCapabilities(format='json') {
  if(format==='json') return JSON.stringify(CAPABILITIES,null,2)+'\n';
  if(format==='text') return [
    'VibeSane AgentShield coverage — NOT a security certification',
    'Code: JavaScript, TypeScript, SQL (selected static security heuristics)',
    'Configuration: JSON, YAML, .env (pattern-based partial checks)',
    'Experimental: JS/TS AST + selected request-to-SQL taint (unpublished hybrid beta, opt-in only)',
    'Local AI: opt-in advisory explanations only; no independent AI detection',
    'Python, Go, Java, Rust, C#, PHP, Ruby and others: no dedicated SAST support',
    'Unsupported, incomplete and unverified results must not be labeled clean.',
    '',
  ].join('\n');
  throw Error('Supported formats: json or text');
}
if(process.argv[1]?.endsWith('agentshield-capabilities.mjs')) {
  const format=process.argv[1]?process.argv[2]||'json':'json';
  try {process.stdout.write(printCapabilities(format));}
  catch {process.stdout.write(JSON.stringify({status:'error'})+'\n');process.exitCode=2;}
}
