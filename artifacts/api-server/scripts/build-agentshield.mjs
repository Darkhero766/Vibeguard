import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { build } from 'esbuild';

const artifactDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(artifactDir, 'dist');
await mkdir(outputDir, { recursive: true });
await build({
  entryPoints: [path.join(artifactDir, 'scripts/agentshield-cli.mjs')],
  outfile: path.join(outputDir, 'agentshield.mjs'),
  platform: 'node', format: 'esm', bundle: true, target: 'node20',
  sourcemap: false, minify: false,
});
console.log('AgentShield CLI built at artifacts/api-server/dist/agentshield.mjs');
