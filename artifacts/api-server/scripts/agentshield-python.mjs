// Conservative Python security heuristics for AgentShield.
// This is not a Python AST or taint engine; ambiguous patterns stay Medium confidence.
const LINE_LIMIT = 8000;
const SEVERITY = Object.freeze({ Critical: 4, High: 3, Medium: 2, Low: 1 });

function lineAt(source, index) {
  return source.slice(0, index).split('\n').length;
}
function finding(file, check, severity, confidence, title, description, recommendation, index) {
  return {
    id: check + '-' + file.path + '-' + lineAt(file.content, index),
    check,
    ruleId: check,
    severity,
    confidence,
    engine: 'python_heuristics',
    title,
    description,
    recommendation,
    filePath: file.path,
    line: lineAt(file.content, index),
  };
}
function codeOnly(line) {
  // Avoid common false positives in comments/docstrings. This deliberately masks
  // only full-line comments and quoted lines, not a complete Python lexer.
  const trimmed = line.trimStart();
  if (trimmed.startsWith('#')) return '';
  return line;
}
function inspectCall(source, pattern, callback) {
  for (const match of source.matchAll(pattern)) callback(match);
}
export function scanPythonFiles(files = []) {
  const findings = [];
  for (const file of files) {
    if (!/\.pyi?$/i.test(file.path)) continue;
    const lines = file.content.split('\n');
    if (lines.length > LINE_LIMIT) {
      findings.push(finding(file, 'python_scan_limit', 'Low', 'high',
        'Python file exceeds the per-file analysis line budget',
        'This file was not fully analyzed by the Python heuristic engine.',
        'Split the review or run a dedicated Python SAST tool; do not treat this file as covered.', 0));
      continue;
    }
    const source = lines.map(codeOnly).join('\n');

    // shell=True turns a command string into a shell program. Only elevate to
    // High when dynamic or request-shaped values are visible nearby.
    inspectCall(source,
      /\b(?:subprocess\.)?(?:run|Popen|call|check_call|check_output)\s*\(([\s\S]{0,700}?)\bshell\s*=\s*True\b[\s\S]{0,180}?\)/g,
      (match) => {
        const snippet = match[0];
        const dynamic = /\bf["'][\s\S]*?\{|\.\s*format\s*\(|\s%\s*(?:\(|[A-Za-z_])|\s\+\s*[A-Za-z_]/.test(snippet);
        const untrusted = /\b(?:request|args|argv|query|params?|input|user|payload|form|headers?)\b/i.test(snippet);
        if (!dynamic && !untrusted) return;
        const confidence = dynamic && untrusted ? 'medium' : 'low';
        findings.push(finding(file, 'python_shell_injection', 'High', confidence,
          'Potential command injection through shell=True',
          'A subprocess call enables shell interpretation and appears to construct or source part of the command dynamically. Confirm whether the value can be influenced by an untrusted caller.',
          'Prefer an argument array with shell=False. Validate each argument against an allowlist and avoid building shell command strings.',
          match.index || 0));
      });

    // Unsafe pickle deserialization is only flagged when call context contains
    // a user/request-shaped source, reducing noise from trusted local caches.
    inspectCall(source,
      /\bpickle\.(?:loads?|Unpickler)\s*\(([\s\S]{0,500}?)\)/g,
      (match) => {
        const untrusted = /\b(?:request|args|argv|query|params?|input|user|payload|upload|body|socket)\b/i.test(match[1]);
        if (!untrusted) return;
        findings.push(finding(file, 'python_unsafe_deserialization', 'High', 'medium',
          'Potential unsafe pickle deserialization of externally influenced data',
          'Pickle can execute code during deserialization. A request-shaped or user-controlled value appears in the input expression; verify the actual data flow.',
          'Do not unpickle untrusted data. Use a safe, schema-validated serialization format such as JSON for untrusted inputs.',
          match.index || 0));
      });

    // yaml.load without a safe loader; FullLoader is intentionally not on the
    // safe allowlist because its safety properties are not equivalent to SafeLoader.
    inspectCall(source,
      /\byaml\.load\s*\(([\s\S]{0,500}?)\)/g,
      (match) => {
        if (/\bLoader\s*=\s*(?:yaml\.)?(?:SafeLoader|CSafeLoader)\b/.test(match[1])) return;
        findings.push(finding(file, 'python_unsafe_yaml_load', 'High', 'medium',
          'YAML loaded without a safe loader',
          'yaml.load appears to be called without SafeLoader or CSafeLoader. Unsafe YAML constructors can instantiate arbitrary Python objects.',
          'Use yaml.safe_load or explicitly pass yaml.SafeLoader/CSafeLoader, then validate the resulting data against an application schema.',
          match.index || 0));
      });

    // Disabling TLS verification defeats certificate validation.
    inspectCall(source,
      /\b(?:requests\.(?:get|post|put|patch|delete|request)|httpx\.(?:get|post|put|patch|delete|request)|session\.(?:get|post|put|patch|delete|request))\s*\(([\s\S]{0,500}?)\bverify\s*=\s*False\b/g,
      (match) => findings.push(finding(file, 'python_tls_verification_disabled', 'High', 'high',
        'TLS certificate verification is disabled',
        'An HTTP client call explicitly disables TLS certificate verification, enabling interception by an attacker able to influence the network path.',
        'Remove verify=False. Configure a trusted CA bundle if a private certificate authority is required.',
        match.index || 0)));

    inspectCall(source,
      /\bssl\._create_unverified_context\s*\(/g,
      (match) => findings.push(finding(file, 'python_tls_verification_disabled', 'High', 'high',
        'Unverified TLS context is created',
        'ssl._create_unverified_context disables certificate validation for TLS connections.',
        'Use ssl.create_default_context and configure a trusted CA rather than disabling peer verification.',
        match.index || 0)));

    inspectCall(source,
      /\btempfile\.mktemp\s*\(/g,
      (match) => findings.push(finding(file, 'python_insecure_tempfile', 'Medium', 'high',
        'Race-prone temporary filename API is used',
        'tempfile.mktemp returns a name without securely creating the file, creating a time-of-check/time-of-use race.',
        'Use tempfile.NamedTemporaryFile, TemporaryDirectory, or mkstemp so the file is created securely.',
        match.index || 0)));

    inspectCall(source,
      /\b(?:eval|exec)\s*\(\s*(?:request\.[A-Za-z_]\w*|input\s*\(|request\[['"][^'"]+['"]\]|request\.args)/g,
      (match) => findings.push(finding(file, 'python_dynamic_code_from_input', 'Critical', 'medium',
        'Dynamic Python execution appears to consume request input',
        'eval or exec appears to receive a value obtained from a request or interactive input. Confirm whether this reaches executable source.',
        'Remove dynamic execution of untrusted data. Replace it with a fixed operation map and strict input validation.',
        match.index || 0)));
  }
  const unique = new Map();
  for (const item of findings) {
    const key = [item.filePath, item.line, item.check].join(':');
    if (!unique.has(key)) unique.set(key, item);
  }
  return [...unique.values()].sort((a, b) =>
    (SEVERITY[b.severity] || 0) - (SEVERITY[a.severity] || 0)
    || a.filePath.localeCompare(b.filePath) || a.line - b.line);
}
