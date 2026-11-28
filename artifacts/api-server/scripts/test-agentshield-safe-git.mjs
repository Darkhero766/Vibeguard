import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { assertSafeGitConfiguration } from './agentshield-safe-git.mjs';

const exec = promisify(execFile);

async function initRepo(root) {
  await mkdir(root, { recursive: true });
  await exec('git', ['init', '-q', root]);
  await exec('git', ['-C', root, 'config', 'user.name', 'Foxy Safe Git Test']);
  await exec('git', ['-C', root, 'config', 'user.email', 'foxy-safe-git@example.invalid']);
  await writeFile(path.join(root, 'sample.txt'), 'safe fixture\n');
  await exec('git', ['-C', root, 'add', 'sample.txt']);
  await exec('git', ['-C', root, 'commit', '-qm', 'fixture']);
}

test('accepts ordinary Git repository configuration', async (t) => {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'foxy-safe-git-'));
  const root = path.join(parent, 'repo');
  t.after(() => rm(parent, { recursive: true, force: true }));
  await initRepo(root);
  assert.equal(await assertSafeGitConfiguration(root), true);
});

test('rejects a repository clean filter before any worktree scan can invoke it', async (t) => {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'foxy-filter-reject-'));
  const root = path.join(parent, 'repo');
  const marker = path.join(parent, 'filter-executed.txt');
  t.after(() => rm(parent, { recursive: true, force: true }));
  await initRepo(root);
  await writeFile(path.join(root, '.gitattributes'), '*.txt filter=foxy-test\n');
  await exec('git', ['-C', root, 'add', '.gitattributes']);
  await exec('git', ['-C', root, 'commit', '-qm', 'add filter attribute']);
  const payload = 'node -e "require(\'node:fs\').writeFileSync('
    + JSON.stringify(marker) + ', \'executed\')"';
  await exec('git', ['-C', root, 'config', '--local', 'filter.foxy-test.clean', payload]);
  await assert.rejects(assertSafeGitConfiguration(root), /executable-capable setting \(filter\.foxy-test\.clean\)/);
  await assert.rejects(readFile(marker, 'utf8'), { code: 'ENOENT' });
});

test('rejects other executable-capable Git configuration families', async (t) => {
  const blockedKeys = [
    ['filter.foxy-test.process', 'node -e "process.exit(0)"'],
    ['filter.foxy-test.smudge', 'node -e "process.exit(0)"'],
    ['diff.foxy-test.textconv', 'node -e "process.exit(0)"'],
    ['diff.external', 'node -e "process.exit(0)"'],
    ['alias.status', '!node -e "process.exit(0)"'],
    ['include.path', '../external.gitconfig'],
    ['core.fsmonitor', 'node -e "process.exit(0)"'],
    ['credential.helper', '!node -e "process.exit(0)"'],
    ['merge.foxy-test.driver', 'node -e "process.exit(0)"'],
  ];
  for (const [key, value] of blockedKeys) {
    const parent = await mkdtemp(path.join(os.tmpdir(), 'foxy-config-key-'));
    const root = path.join(parent, 'repo');
    try {
      await initRepo(root);
      await exec('git', ['-C', root, 'config', '--local', key, value]);
      await assert.rejects(assertSafeGitConfiguration(root), new RegExp(key.replaceAll('.', '\\.'), 'i'));
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  }
});

test('checks common Git configuration reached through a linked worktree .git file', async (t) => {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'foxy-worktree-config-'));
  const root = path.join(parent, 'repo');
  const worktree = path.join(parent, 'worktree');
  t.after(() => rm(parent, { recursive: true, force: true }));
  await initRepo(root);
  await exec('git', ['-C', root, 'worktree', 'add', '-q', '-b', 'foxy-audit-worktree', worktree]);
  const dotGit = await readFile(path.join(worktree, '.git'), 'utf8');
  assert.match(dotGit, /^gitdir:/);
  await exec('git', ['-C', root, 'config', '--local', 'filter.foxy-test.clean', 'node -e "process.exit(0)"']);
  await assert.rejects(assertSafeGitConfiguration(worktree), /filter\.foxy-test\.clean/);
});
