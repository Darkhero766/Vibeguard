#!/usr/bin/env node
// Isolated bounded AST scanner subprocess. Never runs repository scripts or imports.
import { analyzeRepositoryPaths } from './agentshield-ast.mjs';

async function main() {
  const [root, encoded] = process.argv.slice(2);
  if (!root || !encoded || encoded.length > 100_000) throw new Error('Invalid AST input size.');
  const paths=JSON.parse(encoded);
  if (!Array.isArray(paths) || paths.length > 100) throw new Error('Invalid AST selected file list.');
  const result=await analyzeRepositoryPaths(root,paths);
  process.stdout.write(JSON.stringify(result)+'\n');
}
main().catch(()=>{
  process.stderr.write('AST worker failed; no AST security pass can be reported.\n');
  process.exitCode=2;
});
