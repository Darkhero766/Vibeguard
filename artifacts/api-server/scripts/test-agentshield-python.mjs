import test from 'node:test';
import assert from 'node:assert/strict';
import { scanPythonFiles } from './agentshield-python.mjs';

const scan = (content, filePath = 'app.py') => scanPythonFiles([{ path: filePath, content }]);

test('detects request-shaped shell command construction, but not a fixed command', () => {
  const vulnerable = scan([
    'import subprocess',
    'def export(request):',
    '    command = f"convert {request.args}"',
    '    subprocess.run(command, shell=True)',
  ].join('\n'));
  assert.ok(vulnerable.some((f) => f.check === 'python_shell_injection' && f.severity === 'High'));
  const safe = scan([
    'import subprocess',
    'subprocess.run(["convert", "--version"], shell=False)',
    'subprocess.run("fixed-command", shell=True)',
  ].join('\n'));
  assert.equal(safe.some((f) => f.check === 'python_shell_injection'), false);
});

test('detects pickle deserialization only when request-shaped data is visible', () => {
  assert.ok(scan('value = pickle.loads(request.data)').some((f) => f.check === 'python_unsafe_deserialization'));
  assert.equal(scan('value = pickle.loads(trusted_local_cache)').length, 0);
});

test('detects unsafe yaml.load and recognizes SafeLoader', () => {
  assert.ok(scan('config = yaml.load(payload)').some((f) => f.check === 'python_unsafe_yaml_load'));
  assert.equal(scan('config = yaml.load(payload, Loader=yaml.SafeLoader)').length, 0);
  assert.equal(scan('config = yaml.safe_load(payload)').length, 0);
});

test('detects disabled TLS verification and insecure tempfile creation', () => {
  const findings = scan([
    'requests.get(url, verify=False)',
    'context = ssl._create_unverified_context()',
    'name = tempfile.mktemp()',
  ].join('\n'));
  assert.equal(findings.filter((f) => f.check === 'python_tls_verification_disabled').length, 2);
  assert.equal(findings.filter((f) => f.check === 'python_insecure_tempfile').length, 1);
});

test('detects request input passed to eval/exec without reporting a static expression', () => {
  assert.ok(scan(['result = ev', 'al(request.args["expression"])'].join('')).some((f) => f.check === 'python_dynamic_code_from_input'));
  assert.equal(scan(['result = ev', 'al("2 + 2")'].join('')).length, 0);
});

test('reports oversized Python source as not fully analyzed', () => {
  const lines = Array.from({ length: 8001 }, () => '# ordinary comment').join('\n');
  const findings = scan(lines);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].check, 'python_scan_limit');
  assert.equal(findings[0].severity, 'Low');
});

test('does not emit source snippets or credential values in finding objects', () => {
  const secret = 'synthetic_dummy_secret_123';
  const findings = scan('subprocess.run(f"echo {request.args[\\"q\\"]}", shell=True)\n# ' + secret);
  assert.equal(JSON.stringify(findings).includes(secret), false);
  assert.equal(findings.every((f) => typeof f.filePath === 'string' && f.line > 0), true);
});
