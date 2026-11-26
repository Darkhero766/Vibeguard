import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
const expected = process.env.FOXY_EXPECTED_SHA;
if (!/^[a-f0-9]{40}$/i.test(expected || '')) throw new Error('FOXY_EXPECTED_SHA must be the exact 40-character source commit.');
const { stdout } = await exec('git', ['rev-parse', 'HEAD'], { timeout: 5000, windowsHide: true });
const actual = stdout.trim();
if (actual !== expected) throw new Error('Foxy qualification checked out ' + actual + ' but PR source is ' + expected + '.');
console.log('Foxy source identity verified: ' + actual);
