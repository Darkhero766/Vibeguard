# VibeSane Phase 2 — Real-world scanner evidence protocol (pilot v1)

**Status: engineering infrastructure, NOT an independently verified benchmark result or release certification.** VibeSane's current supported analysis covers selected JavaScript, TypeScript, SQL and configuration patterns. Reading another language is not equivalent to language-aware SAST support.

## Independent source materials informing the method

- [OWASP Benchmark](https://owasp.org/projects/benchmark): expected true/false cases, CWE labels and reproducible scoring. The published Java/Python benchmark is NOT a JavaScript certification.
- [SecBench.js](https://github.com/cristianstaicu/SecBench.js): academic executable server-side JavaScript vulnerability corpus. Check per-project licenses before reuse.
- [OWASP Juice Shop](https://owasp.org/projects/juice-shop) and [OWASP NodeGoat](https://owasp.org/projects/nodejs-goat): deliberately vulnerable applications, NOT automatic labels for every scanner alert.
- [OWASP Vulnerable Web Applications Directory](https://vwad.owasp.org/): legally usable learning/scanner-testing source discovery.
- [Semgrep rule-writing methodology](https://semgrep.dev/blog/2020/writing-semgrep-rules-a-methodology/): positive and negative rule tests and real-repository validation.
- [Trail of Bits introduction to Semgrep](https://www.youtube.com/watch?v=yKQlTbVlf0Q): developer-friendly technical tutorial on triage, rule writing and CI.
- [Nullcon researcher talk on false-positive reduction](https://www.youtube.com/watch?v=RvKLn2ofMAo): experience applying custom static checks to many real projects.
- [NIST SARD](https://samate.nist.gov/SARD/): limitations of synthetic test cases, incidental flaws and assumptions about true negatives.

Independent method and evidence matter more than raw alert totals. In the November 21 NodeGoat staging testing, counts dropped from 1,317 to 13 after eliminating a lockfile false-positive flood and restoring private-key coverage. Documentation URLs and commented code caused additional incorrect alerts. This pilot exists to quantify and prevent these errors.

## Public sources and sampling

The [pilot manifest](../artifacts/api-server/benchmarks/real-world/pilot-manifest.v1.json) starts with **five** license-checked, 40-character pinned GitHub source candidates — NOT 30 completed evaluations.

- A whole_repo scope covers only files eligible under the implemented reader, subject to documented size/file budgets. It does not imply unsupported language analysis.
- A bounded_subset scope is exactly the declared list of pinned files, not entire-repository coverage.
- A deliberately_vulnerable project may include deliberate weaknesses, but its scanner alerts must be individually adjudicated.
- An unlabeled_general project is NOT proven clean; it supplies real-world examples for candidate alert review.

Preserve each source SHA and scanner ruleset SHA, files/lines analyzed, duration, included scope, missing/failed files, engine version and actual findings. Never include source contents, raw credentials, private keys, GitHub access tokens, exploitable payloads, user personal details or logs revealing secrets in benchmark artifacts.

## Labels and scoring

The raw scan and human-review files are separate. A finding identity is the exact ruleId, filePath and line. Each review has a reviewer, evidence and one verdict: true_positive, false_positive, uncertain, or duplicate. A source being deliberately vulnerable is **not** evidence that every flagged line is a true positive.

Expected positive targets are separately curated by a reviewer using a rule ID, pinned file and bounded line range. They are the only targets eligible for the restricted recall calculation. Scorer validation is structural; the scorer cannot independently prove that annotations are accurate or reviewers independent.

- Reviewed precision = reviewed true positives / (reviewed true positives + reviewed false positives).
- Curated-target recall = detected curated targets / all curated supported targets.
- Uncertain, duplicate, and unreviewed results are explicitly counted but not treated as reviewed positives or negatives.
- No source review means precision = null. No independently curated targets means recall = null. No unwarranted true-negative count.
- Incomplete scans are never treated as clean, and unsupported analysis is never counted as a successful negative.
- Always disclose case counts, sample construction, file/line coverage, unsupported classes, and label limitations alongside any percentages.

## Manual instructions (no external code execution)

From repo root after installing locked dependencies:

1. Offline manifest check:

   node artifacts/api-server/scripts/vibesane-benchmark-evidence.mjs --validate artifacts/api-server/benchmarks/real-world/pilot-manifest.v1.json

2. Opt-in capture of a **public pinned source** (does not use app scan quotas, Supabase, or production endpoints):

   VIBESANE_RULESET_SHA="$(git rev-parse HEAD)" node artifacts/api-server/scripts/collect-vibesane-public-evidence.mjs --manifest artifacts/api-server/benchmarks/real-world/pilot-manifest.v1.json --repo OWASP/NodeGoat --output /tmp/nodegoat-pilot-scan.json

   Public GitHub API rate limits may require a GITHUB_TOKEN environment variable. Do not enter token text into the command, source, CI logs, benchmark report or chat. Output uses exclusive file creation and restrictive file permissions. The collector reads source through the GitHub API, statically analyzes it, and emits only finding metadata; it never runs repository scripts.

3. Review the actual results, recording human evidence. The minimal empty reviewer document is:

   {"schemaVersion":1,"projects":[]}

   A project review object must include matching repo and commit, plus adjudications and expectedTargets arrays. Never infer labels from the scanner itself.

4. Combine the per-project scan results' projects arrays without changing source or ruleset pins, then score offline:

   node artifacts/api-server/scripts/vibesane-benchmark-evidence.mjs --score artifacts/api-server/benchmarks/real-world/pilot-manifest.v1.json /tmp/scans.json /tmp/reviews.json

A score with an empty review file intentionally has **null precision** and **null recall**, not 0%, 100%, or a vendor-facing performance claim. The collector's engine is currently EXTENDED V2 ONLY: this is NOT full VibeSane public-web product parity. Product-level accuracy must be benchmarked separately.


## 21 November 2026 — 30-repository pinned source selection

The [30-candidate manifest](../artifacts/api-server/benchmarks/real-world/phase2-30-manifest.v1.json) **preserves the five original pilot entries** and adds 25 publicly visible, SPDX-license-verified repositories. Each added source was pinned to a verified 40-hex Git commit; all added declared file paths were checked against that commit's Git tree. It spans 5 deliberately vulnerable applications and 25 unlabeled general-purpose repositories. There are 109 explicitly declared source file paths in bounded subsets, plus two inherited whole-repository scopes; neither number is a completed scan count.

**Selection is not measurement.** None of these new entries has an independent human finding adjudication, and no general precision, recall, true-negative rate or security certification may be claimed from a manifest. Some libraries are security-focused yet not "proven clean"; many scopes are deliberately bounded subsets, not complete apps. The current engine is `extended_v2_only`, not every experimental AgentShield detector or a production-equivalent end-to-end audit.

### Offline verification (mandatory in CI)

From the repository checkout, with no network or external source execution:

```sh
node artifacts/api-server/scripts/vibesane-benchmark-evidence.mjs --validate artifacts/api-server/benchmarks/real-world/phase2-30-manifest.v1.json
node --test artifacts/api-server/scripts/test-vibesane-realworld-runner.mjs
node artifacts/api-server/scripts/run-vibesane-realworld-benchmark.mjs \
  --manifest artifacts/api-server/benchmarks/real-world/phase2-30-manifest.v1.json \
  --output-dir /tmp/vibesane-realworld-evidence --all --dry-run
```

The CI step verifies schema, distinct pins, pilot continuity, metrics invariants, path safety and network-free dry-run. **Standard CI does not fetch the 30 source repositories**, cannot supply manual labels, and must not call this a passed real-world accuracy evaluation.

### Explicit opt-in public-source collection

On a trusted checkout with locked project dependencies installed and no uncommitted scanner changes, use:

```sh
node artifacts/api-server/scripts/run-vibesane-realworld-benchmark.mjs \
  --manifest artifacts/api-server/benchmarks/real-world/phase2-30-manifest.v1.json \
  --output-dir /tmp/vibesane-realworld-evidence --all
```

Use `--repo OWNER/REPO` instead of `--all` to validate one candidate. This is a sequential, bounded, read-only public GitHub source analysis (with per-repository timeout); it **never executes fetched code** or uses the app's Supabase, production, billing, or scan quota. It derives `rulesetCommit` from local `git rev-parse HEAD` and refuses dirty scanner paths. The collector itself pins the source tree and rejects private repositories; missing, omitted, truncated, or oversized inputs remain incomplete. API limits and source availability can prevent scans from completing.

Output is local, per-repository metadata-only scan JSON, plus `unreviewed-summary.json`. Existing matching raw scan records can be reused on retry; mismatched ruleset/source records are rejected. Resolve incomplete artifacts deliberately rather than treating them as zero findings. The runner reports null precision and recall **even when all 30 scans finish**, because no independent review has been performed.

### Independent reviewer handoff (blocking Phase 2 gate)

1. Have qualified security reviewers independently inspect each pinned source around sampled alert lines and relevant execution paths. Record explicit `true_positive`, `false_positive`, `uncertain`, or `duplicate` verdicts and evidence; distinguish lexical risk hints from exploitable flaws. Reconcile conflicts openly.
2. Separately inspect vulnerabilities that scanners might **miss** and create supported `expectedTargets` with exact rule ID, file, start/end lines, reviewer and substantive evidence. Do not derive this list solely from scanner alerts; otherwise measured recall is circular.
3. Record whether alert severity is contextually appropriate, note supported vs unsupported vulnerability classes, and preserve reviewer provenance. Never infer true negatives from general source code or from the project's vulnerable/benign label.
4. Assemble only the independently reviewed adjudications in a separate reviewer JSON file (see v1 scorer schema and existing regression fixtures). Score using `--score MANIFEST SCANS REVIEWS`; include denominator counts, complete-source coverage, review coverage, exclusions, per-rule metrics, and uncertainty in any internal result. Human expertise and traceable evidence, not AI-generated labels, are required for an independent verification claim.

[Engineering gate issue #62](https://github.com/Darkhero766/Vibeguard/issues/62) remains **open** until source scans, human review and security signoff are actually evidenced. The manifest and automated machinery are preparation, not the final release gate. Do not merge PR #61 or deploy to production based on these changes.

## Milestones and release protections

Validate the original five-source pilot first, then collect and adjudicate the 30 pinned candidate sources. Investigate runtime, GitHub rate limits and partial coverage. A 30-source selection is available, but independent security adjudication and evidence from real scans are not yet complete. Resolve reviewer disagreements, keep final holdout cases genuinely untouched, then compare results by rule and severity with denominator counts, duplicates, abstentions, scoped recall and p50/p95 times.

The external collector never runs in standard CI. CI tests the **benchmark machinery** using synthetic local data and validates manifest schema only. This work stays in the Phase 1/2 feature branch and does not authorize production changes, beta launch, autonomous remediation or public accuracy claims.

A zero-finding report cannot establish an application is secure.
