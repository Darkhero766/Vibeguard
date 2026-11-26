import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, "../../..");
let helpers;
async function load() {
  if (!helpers) {
    const result = await build({
      entryPoints: [
        path.join(root, "artifacts/api-server/src/lib/protectionDelta.ts"),
        path.join(root, "artifacts/api-server/src/lib/securityScanPipeline.ts"),
        path.join(root, "artifacts/api-server/src/lib/githubRepoReader.ts"),
      ],
      bundle: true,
      splitting: false,
      format: "esm",
      platform: "node",
      target: "node20",
      outdir: "/tmp/vibesane-protection-delta",
      write: false,
      logLevel: "silent",
    });
    const read = async (name) => {
      const file = result.outputFiles.find(item => item.path.endsWith(name + ".js"));
      assert.ok(file, "Missing bundled helper " + name);
      return import("data:text/javascript;base64," + Buffer.from(file.contents).toString("base64"));
    };
    helpers = {
      delta: await read("protectionDelta"),
      pipeline: await read("securityScanPipeline"),
      reader: await read("githubRepoReader"),
    };
  }
  return helpers;
}

test("protection pipeline executes core and extended checks against one file snapshot", async () => {
  const { pipeline } = await load();
  const findings = pipeline.scanRepositoryFiles([
    {
      path: "supabase/migrations/001_create_items.sql",
      content: "create table public.items (id uuid primary key);\\n",
    },
    {
      path: "src/auth.js",
      content: 'const token = "ghp_' + "A".repeat(36) + '";\\n',
    },
  ]);
  assert.ok(findings.some(f => f.check === "rls" && f.severity === "Critical"),
    "Core RLS check must be included in the protection pipeline.");
  assert.ok(findings.some(f => f.check === "github_token"),
    "Extended secret check must also be included.");
  assert.equal(findings.some(f => f.check === "rls_policy_missing"), false);
});

test("delta matching treats line movement as existing when finding evidence is unchanged", async () => {
  const { delta } = await load();
  const base = [{ severity: "High", filePath: "src/auth.ts", line: 2, check: "weak_hash", title: "Weak hash" }];
  const head = [{ severity: "High", filePath: "src/auth.ts", line: 4, check: "weak_hash", title: "Weak hash" }];
  const result = delta.classifyFindingDelta(base, head,
    [{ path: "src/auth.ts", content: "one\\nmd5(password)\\nthree\\n" }],
    [{ path: "src/auth.ts", content: "added\\nlines\\none\\nmd5(password)\\nfive\\n" }]);
  assert.equal(result.introduced.length, 0);
  assert.equal(result.resolved.length, 0);
  assert.equal(result.existing.length, 1);
});

test("delta matching reports a new occurrence even when the same rule already exists in the file", async () => {
  const { delta } = await load();
  const base = [{ severity: "High", filePath: "src/auth.ts", line: 2, check: "weak_hash", title: "Weak hash" }];
  const head = [
    { severity: "High", filePath: "src/auth.ts", line: 2, check: "weak_hash", title: "Weak hash" },
    { severity: "High", filePath: "src/auth.ts", line: 8, check: "weak_hash", title: "Weak hash" },
  ];
  const baseText = "one\\nmd5(password)\\nthree\\n";
  const headText = "one\\nmd5(password)\\nthree\\nfour\\nfive\\nsix\\nseven\\nmd5(resetToken)\\n";
  const result = delta.classifyFindingDelta(base, head,
    [{ path: "src/auth.ts", content: baseText }],
    [{ path: "src/auth.ts", content: headText }]);
  assert.equal(result.introduced.length, 1);
  assert.equal(result.introduced[0].line, 8);
  assert.equal(result.existing.length, 1);
});

test("delta matching flags severity upgrades and reports resolved findings", async () => {
  const { delta } = await load();
  const base = [
    { severity: "Medium", filePath: "src/a.js", line: 2, check: "eval_usage", title: "Dynamic eval" },
    { severity: "High", filePath: "src/b.js", line: 1, check: "hardcoded_secret", title: "Secret" },
  ];
  const head = [
    { severity: "Critical", filePath: "src/a.js", line: 2, check: "eval_usage", title: "Dynamic eval" },
  ];
  const result = delta.classifyFindingDelta(base, head,
    [
      { path: "src/a.js", content: "const x = eval(input);\\n" },
      { path: "src/b.js", content: 'const token = "secret";\\n' },
    ],
    [{ path: "src/a.js", content: "const x = eval(input);\\n" }]);
  assert.equal(result.introduced.length, 1);
  assert.equal(result.introduced[0].severity, "Critical");
  assert.equal(result.resolved.length, 1);
  assert.equal(result.resolved[0].filePath, "src/b.js");
});

test("ambiguous metadata-only duplicates are not fuzzy matched", async () => {
  const { delta } = await load();
  const base = [
    { severity: "High", filePath: "src/a.js", line: null, check: "rule_x", title: "Risk" },
    { severity: "High", filePath: "src/a.js", line: null, check: "rule_x", title: "Risk" },
  ];
  const head = [{ severity: "High", filePath: "src/a.js", line: null, check: "rule_x", title: "Risk" }];
  const result = delta.classifyFindingDelta(base, head, [], []);
  assert.equal(result.existing.length, 0);
  assert.equal(result.resolved.length, 2);
  assert.equal(result.introduced.length, 1);
});

test("repository read planner reports unsupported, missing, and intentionally excluded paths", async () => {
  const { reader } = await load();
  const plan = reader.planRepositoryRead([
    { type: "blob", path: "src/app.ts", size: 10 },
    { type: "blob", path: "artifacts/api-server/src/lib/apiScanner.ts", size: 10 },
  ], [
    "src/app.ts",
    "assets/logo.png",
    "artifacts/api-server/src/lib/apiScanner.ts",
    "src/deleted.ts",
  ], true);
  assert.deepEqual(plan.missingRequestedPaths, ["src/deleted.ts"]);
  assert.deepEqual(plan.unsupportedRequestedPaths, ["assets/logo.png"]);
  assert.deepEqual(plan.selfExcludedPaths, ["artifacts/api-server/src/lib/apiScanner.ts"]);
  assert.deepEqual(plan.selectedEntries.map(entry => entry.path), ["src/app.ts"]);
});

test("repository read planner never silently truncates over the configured file cap", async () => {
  const { reader } = await load();
  const entries = Array.from({ length: 305 }, (_, i) => ({
    type: "blob", path: "src/file-" + i + ".ts", size: 20,
  }));
  const plan = reader.planRepositoryRead(entries, null, false);
  assert.equal(plan.eligibleEntries.length, 305);
  assert.equal(plan.selectedEntries.length, 300);
  assert.equal(plan.omittedByFileLimit, 5);
});


test("GitHub changed-file statuses map exact base/head snapshot paths", async () => {
  const { delta } = await load();
  const plan = delta.buildChangedPathPlan([
    { filename: "src/new.ts", status: "added" },
    { filename: "src/removed.ts", status: "removed" },
    { filename: "src/edited.ts", status: "modified" },
    { filename: "src/new-name.ts", previous_filename: "src/old-name.ts", status: "renamed" },
  ]);
  assert.deepEqual(plan.basePaths, ["src/edited.ts", "src/old-name.ts", "src/removed.ts"]);
  assert.deepEqual(plan.headPaths, ["src/edited.ts", "src/new-name.ts", "src/new.ts"]);
  assert.deepEqual(plan.renamedPaths, { "src/old-name.ts": "src/new-name.ts" });
});

test("unknown rename metadata fails closed instead of silently omitting its old path", async () => {
  const { delta } = await load();
  assert.throws(() => delta.buildChangedPathPlan([
    { filename: "src/new.ts", status: "renamed" },
  ]), /previous path/i);
});
