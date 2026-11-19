// GitHub security check summaries and annotations use issue metadata only.
// Never publish source snippets, matched credentials, customer secrets or prompts.
type ScanFinding = {
  severity?: unknown;
  filePath?: unknown;
  line?: unknown;
  check?: unknown;
};
type Report = {
  findings?: ScanFinding[];
  changedFiles?: number;
  filesScanned?: number;
  checksRun?: number;
  scanMode?: string;
  scanIncomplete?: boolean;
};
type Annotation = {
  path: string;
  start_line: number;
  end_line: number;
  annotation_level: 'failure' | 'warning' | 'notice';
  title: string;
  message: string;
};
const tick = String.fromCharCode(96);
function safeText(value: unknown, maxLength: number): string {
  return String(value ?? '').replace(/[\x00-\x1f\x7f<>\x60|]/g, '_').slice(0,maxLength);
}
function safePath(value: unknown): string | null {
  if(typeof value !== 'string' || !value || value.length > 512) return null;
  if(value.startsWith('/') || value.includes('\\') ||
    value.split('/').some(x=>!x || x==='.' || x==='..')) return null;
  return safeText(value,350);
}
function count(value: unknown): number {
  const n=Number(value);
  return Number.isSafeInteger(n) && n>=0 ? Math.min(n,100_000) : 0;
}
function severity(value: unknown): 'Critical' | 'High' | 'Medium' | null {
  return ['Critical','High','Medium'].includes(String(value))
    ? value as 'Critical' | 'High' | 'Medium' : null;
}
export function buildVibeSaneCheckOutput(report: Report) {
  const findings=Array.isArray(report?.findings) ? report.findings : [];
  const valid=findings.map(f=>{
    const line=count(f?.line);
    return {severity:severity(f?.severity),path:safePath(f?.filePath),
      line:line>0?line:null,
      check:safeText(f?.check,75).replace(/[^a-zA-Z0-9_.-]/g,'_')||'unknown',
    };
  });
  const critical=valid.filter(f=>f.severity==='Critical').length;
  const high=valid.filter(f=>f.severity==='High').length;
  const medium=valid.filter(f=>f.severity==='Medium').length;
  const score=Math.max(0,100-critical*18-high*10-medium*4);
  const mode=report?.scanMode==='delta'
    ? 'Protection mode: only findings introduced by this change are reported.'
    : '';
  const scanIncomplete=report?.scanIncomplete===true;
  const summaryLines=scanIncomplete?[
    '## VibeSane Security',
    '**Scan incomplete. No security verdict is available.**',
    'The service could not finish the scan. Retry after fixing the scanner error; never treat this as a clean result.',
  ]:[
    '## VibeSane Security',
    valid.length?'**Security score: '+score+'/100**':
      '**No new findings detected in the checked files (not a security guarantee).**',
    valid.length+' new findings — '+critical+' critical, '+high+' high, '+medium+' medium.',
    count(report?.changedFiles ?? report?.filesScanned)+' changed files checked across '+count(report?.checksRun)+' configured security checks.',
  ];
  if(!scanIncomplete) {
    if(mode) summaryLines.push('',mode);
    if(valid.length) {
      summaryLines.push('', '**New findings (metadata only; no source or secrets):**','');
      for(const f of valid.slice(0,25)) {
        const place=f.path?(f.line?' '+tick+f.path+':'+f.line+tick:' '+tick+f.path+tick):' (location unavailable)';
        summaryLines.push('- **'+(f.severity||'Unclassified')+'** · '+tick+f.check+tick+' ·'+place);
      }
      if(valid.length>25) summaryLines.push('- ...and '+(valid.length-25)+' more findings.');
      summaryLines.push('','These are potential risks requiring review; the score does not establish exploitability.');
    }
  }
  const annotations:Annotation[]=scanIncomplete?[]:valid
    .filter(f=>f.severity && f.path && f.line)
    .slice(0,50)
    .map(f=>({
      path:f.path!,
      start_line:f.line!,
      end_line:f.line!,
      annotation_level:f.severity==='Medium'?'warning':'failure',
      title:f.severity+': '+f.check,
      message:'VibeSane rule '+f.check+' reported a potential '+f.severity!.toLowerCase()+
        '-severity issue. Review the affected code. No matched values are included.',
    }));
  return {
    title:scanIncomplete?'VibeSane Security — Scan incomplete':'VibeSane Security — '+score+'/100',
    summary:summaryLines.join('\n').slice(0,60_000),
    annotations,
  };
}
