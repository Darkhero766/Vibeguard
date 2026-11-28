// Refuse Git repositories whose local configuration can execute external programs.
// Git status/diff can invoke clean filters and text-conversion drivers selected by repository data.
// This check is deliberately conservative and runs before Foxy asks Git to inspect a worktree.
import path from 'node:path';
import os from 'node:os';
import { constants } from 'node:fs';
import { open, lstat, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const MAX_CONFIG_BYTES = 256_000;
const MAX_GIT_POINTER_BYTES = 4096;

function executableConfigKey(key) {
  const normalized = String(key).toLowerCase();
  return normalized.startsWith('filter.')
    || normalized.startsWith('include.')
    || normalized.startsWith('includeif.')
    || normalized.startsWith('alias.')
    || normalized === 'diff.external'
    || /^diff\..+\.(?:command|textconv)$/.test(normalized)
    || [
      'core.fsmonitor',
      'core.hookspath',
      'core.pager',
      'core.sshcommand',
      'interactive.difffilter',
    ].includes(normalized)
    || /^credential(?:\..+)?\.helper$/.test(normalized)
    || /^merge\..+\.driver$/.test(normalized)
    || /^remote\..+\.(?:uploadpack|receivepack)$/.test(normalized)
    || /^submodule\..+\.update$/.test(normalized);
}

async function readRegularFile(file, maxBytes, { optional = false } = {}) {
  let before;
  try {
    before = await lstat(file);
  } catch (error) {
    if (optional && error?.code === 'ENOENT') return null;
    throw error;
  }
  if (!before.isFile() || before.isSymbolicLink() || before.size > maxBytes) {
    throw new Error('Foxy refused an unsafe or oversized Git metadata file.');
  }
  const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino
      || opened.size !== before.size || opened.size > maxBytes) {
      throw new Error('Git metadata changed while Foxy was opening it.');
    }
    const content = await handle.readFile('utf8');
    const after = await handle.stat();
    if (after.dev !== opened.dev || after.ino !== opened.ino
      || after.size !== opened.size || after.mtimeMs !== opened.mtimeMs
      || after.ctimeMs !== opened.ctimeMs || Buffer.byteLength(content, 'utf8') !== opened.size) {
      throw new Error('Git metadata changed while Foxy was reading it.');
    }
    return content;
  } finally {
    await handle.close();
  }
}

async function resolveGitDirectory(root) {
  const markerPath = path.join(root, '.git');
  const marker = await lstat(markerPath).catch((error) => {
    if (error?.code === 'ENOENT') throw new Error('Foxy could not locate the repository Git metadata.');
    throw error;
  });
  if (marker.isSymbolicLink()) {
    throw new Error('Foxy refuses a symlinked .git entry because repository configuration cannot be pinned safely.');
  }
  if (marker.isDirectory()) return realpath(markerPath);
  if (!marker.isFile()) throw new Error('Foxy found an unsupported .git entry.');

  const pointer = await readRegularFile(markerPath, MAX_GIT_POINTER_BYTES);
  const match = /^gitdir:\s*(.+?)\s*\r?\n?$/i.exec(pointer || '');
  if (!match || !match[1] || match[1].includes('\n') || match[1].includes('\r')) {
    throw new Error('Foxy found an invalid Git worktree metadata pointer.');
  }
  const target = await realpath(path.resolve(root, match[1]));
  const info = await lstat(target);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error('Foxy found an unsafe Git worktree metadata directory.');
  }
  return target;
}

async function gitMetadataDirectories(gitDirectory) {
  const directories = [gitDirectory];
  const commonPath = path.join(gitDirectory, 'commondir');
  const commonText = await readRegularFile(commonPath, MAX_GIT_POINTER_BYTES, { optional: true });
  if (commonText !== null) {
    const relative = commonText.trim();
    if (!relative || relative.includes('\n') || relative.includes('\r')) {
      throw new Error('Foxy found an invalid Git common-directory pointer.');
    }
    const commonDirectory = await realpath(path.resolve(gitDirectory, relative));
    const info = await lstat(commonDirectory);
    if (!info.isDirectory() || info.isSymbolicLink()) {
      throw new Error('Foxy found an unsafe Git common metadata directory.');
    }
    if (!directories.includes(commonDirectory)) directories.push(commonDirectory);
  }
  return directories;
}

async function keysFromConfigSnapshot(content) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'vibesane-foxy-git-config-'));
  const file = path.join(directory, 'config');
  try {
    await writeFile(file, content, { flag: 'wx', mode: 0o600 });
    // --file + --no-includes parses only the pinned snapshot; it does not load
    // repository/global includes or execute configured filter/driver commands.
    const env = {
      PATH: process.env.PATH || '',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_COUNT: '0',
      GIT_TERMINAL_PROMPT: '0',
      ...(process.env.SYSTEMROOT ? { SYSTEMROOT: process.env.SYSTEMROOT } : {}),
      ...(process.env.WINDIR ? { WINDIR: process.env.WINDIR } : {}),
    };
    const { stdout } = await exec('git', [
      'config', '--file', file, '--no-includes', '--name-only', '--null', '--list',
    ], { timeout: 5000, maxBuffer: 128_000, windowsHide: true, env });
    return stdout.split('\0').filter(Boolean).map((key) => key.toLowerCase());
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function assertSafeGitConfiguration(worktreeRoot) {
  const root = await realpath(worktreeRoot);
  const gitDirectory = await resolveGitDirectory(root);
  const metadataDirectories = await gitMetadataDirectories(gitDirectory);
  const configFiles = new Set();
  for (const directory of metadataDirectories) {
    configFiles.add(path.join(directory, 'config'));
    // Inspect worktree-specific config even when extensions.worktreeConfig is
    // currently disabled, so enabling it cannot expose an unchecked config.
    configFiles.add(path.join(directory, 'config.worktree'));
  }

  for (const configFile of configFiles) {
    const content = await readRegularFile(configFile, MAX_CONFIG_BYTES, { optional: true });
    if (content === null) continue;
    const keys = await keysFromConfigSnapshot(content);
    const blocked = keys.find(executableConfigKey);
    if (blocked) {
      const error = new Error(
        'Foxy refused to inspect this repository because its Git configuration contains an executable-capable setting ('
        + blocked + '). Remove that setting or use a clean checkout before scanning or installing Foxy.',
      );
      error.code = 'FOXY_UNSAFE_GIT_CONFIG';
      throw error;
    }
  }
  return true;
}
