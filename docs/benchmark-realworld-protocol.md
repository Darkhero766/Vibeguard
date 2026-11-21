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

## Milestones and release protections

First validate this five-source pilot. Investigate runtime, GitHub rate limits and partial coverage. Expand to 30 licensed, pinned and independently adjudicated projects or fixtures with relevant supported JS/TS/Supabase scenarios, real-world benign examples, and enough positive examples to measure recall in specified supported checks. Resolve reviewer disagreements, keep final holdout cases genuinely untouched, then compare results by rule and severity with denominator counts, duplicates, abstentions, scoped recall and p50/p95 times.

The external collector never runs in standard CI. CI tests the **benchmark machinery** using synthetic local data and validates manifest schema only. This work stays in the Phase 1/2 feature branch and does not authorize production changes, beta launch, autonomous remediation or public accuracy claims.

A zero-finding report cannot establish an application is secure.
