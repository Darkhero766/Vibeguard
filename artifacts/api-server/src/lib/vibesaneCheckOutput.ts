// GitHub security check summaries and annotations use issue metadata only.
// Never publish source snippets, matched credentials, customer secrets or prompts.
type ScanFinding = {
  severity?: unknown;
  filePath?: unknown;
  line?: unknown;
  check?: unknown;
  title?: unknown;
};
type Report = {
  findings?: ScanFinding[];
  changedFiles?: number;
  filesScanned?: number;
  checksRun?: number;
  scanMode?: string;
  scanIncomplete?: boolean;
  coveragePartial?: boolean;
  unscannedChangedFiles?: unknown[];
  unscannedChangedFileCount?: number;
  coverageReasons?: unknown[];
  resolvedFindingsCount?: number;
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
  return String(value ?? '')
    .replace(/[\x00-\x1f\x7f<>\x60|]/g, '_')
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|sk_(?:live|test)_[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{16}|eyJ[A-Za-z0-9_-]{20,})\b/g, '[redacted]')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[redacted]')
    .slice(0,maxLength);
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
    return {
      severity:severity(f?.severity),
      path:safePath(f?.filePath),
      line:line>0?line:null,
      check:safeText(f?.check,75).replace(/[^a-zA-Z0-9_.-]/g,'_')||'unknown',
      title:safeText(f?.title,160),
    };
  });
  const critical=valid.filter(f=>f.severity==='Critical').length;
  const high=valid.filter(f=>f.severity==='High').length;
  const medium=valid.filter(f=>f.severity==='Medium').length;
  const score=Math.max(0,100-critical*18-high*10-medium*4);
  const scanIncomplete=report?.scanIncomplete===true;
  const coveragePartial=report?.coveragePartial===true;
  const mode=report?.scanMode==='delta';
  const summaryLines=scanIncomplete?[
    '## VibeSane Security',
    '**Scan incomplete. No security verdict is available.**',
    'The service could not finish the scan. Retry after fixing the scanner error; never treat this as a clean result.',
  ]:[
    '## VibeSane Security',
    coveragePartial
      ? '**Partial scan. A complete security verdict is unavailable.**'
      : mode
        ? '**Change risk score: '+score+'/100**'
        : valid.length
          ? '**Security score: '+score+'/100 (checked scope only)**'
          : '**No new findings detected in the checked files (not a security guarantee).**',
    valid.length+' new findings — '+critical+' critical, '+high+' high, '+medium+' medium.',
    count(report?.changedFiles ?? report?.filesScanned)+' changed files checked across '+count(report?.checksRun)+' configured security checks.',
  ];
  if(!scanIncomplete) {
    if(mode) summaryLines.push('', 'Protection mode: only findings introduced by this change are reported.');
    const resolved=count(report?.resolvedFindingsCount);
    if(resolved) summaryLines.push('Previously detected findings no longer present in the current snapshot: '+resolved+'.');
    if(coveragePartial) {
      const unscannedCount=count(report?.unscannedChangedFileCount);
      summaryLines.push('', 'Coverage is partial. Do not interpret the absence of additional findings as a clean result.');
      if(unscannedCount) summaryLines.push(unscannedCount+' changed paths were not inspected.');
      const reasons=Array.isArray(report?.coverageReasons) ? report.coverageReasons : [];
      for(const reason of reasons.slice(0,5)) {
        const clean=safeText(reason,220);
        if(clean) summaryLines.push('- '+clean);
      }
      const paths=Array.isArray(report?.unscannedChangedFiles) ? report.unscannedChangedFiles : [];
      for(const path of paths.slice(0,10)) {
        const clean=safePath(path);
        if(clean) summaryLines.push('- Not scanned: '+tick+clean+tick);
      }
    }
    if(valid.length) {
      summaryLines.push('', '**New findings (sanitized metadata; no source or secrets):**','');
      for(const f of valid.slice(0,25)) {
        const place=f.path?(f.line?' '+tick+f.path+':'+f.line+tick:' '+tick+f.path+tick):' (location unavailable)';
        const title=f.title ? ' — '+f.title : '';
        summaryLines.push('- **'+(f.severity||'Unclassified')+'** · '+tick+f.check+tick+title+' ·'+place);
      }
      if(valid.length>25) summaryLines.push('- ...and '+(valid.length-25)+' more findings.');
      summaryLines.push('','These are potential risks requiring review; the score does not establish exploitability.');
    }
  }
  const annotations:Annotation[]=scanIncomplete?[]:valid
    .filter(f=>f.severity && f.path && f.line)
    .slice(0,50)
    .map(f=>{
      const label=(f.severity+': '+f.check+(f.title?' — '+f.title:'')).slice(0,240);
      return {
        path:f.path!,
        start_line:f.line!,
        end_line:f.line!,
        annotation_level:f.severity==='Medium'?'warning':'failure',
        title:label,
        message:'VibeSane reported a potential '+f.severity!.toLowerCase()+'-severity '+f.check+
          (f.title?': '+f.title:'')+'. Review the affected code. No matched values or source snippets are included.',
      };
    });
  return {
    title:scanIncomplete?'VibeSane Security — Scan incomplete'
      :coveragePartial?'VibeSane Security — Partial coverage'
        :mode?'VibeSane Security — Delta risk '+score+'/100':'VibeSane Security — '+score+'/100',
    summary:summaryLines.join('\n').slice(0,60_000),
    annotations,
  };
}
