# Phase 2 — external AI review triage (2026-11-21)

**Classification: development calibration, not independent review or real-world accuracy certification.** PR #61 stays draft, no production merge/deploy. This document records source spot-checks of claims pasted from a single Claude reviewer. The claimed 13 TP / 98 FP / 1 uncertain total **has NOT been ingested or corroborated case-by-case**: `phase2_30_reviewer_queue_claude_review.json` has not been supplied to this engineering workspace. Do not include it in human-labeled accuracy denominators.

## Pinned source spot-checks

| Rule / source | Evidence from pinned repository | Engineering disposition |
| --- | --- | --- |
| NodeGoat `plaintext_password_storage` | [`app/data/user-dao.js` line 25](https://github.com/OWASP/NodeGoat/blob/c5cb68a7084e4ae7dcc60e6a98768720a81841e8/app/data/user-dao.js#L20-L45) holds a raw password and is inserted; scanner previously pointed at line 20 object opening | Valid candidate security finding; corrected source line to field itself |
| NodeGoat `eval_usage` x3 | [`contributions.js` 32–34](https://github.com/OWASP/NodeGoat/blob/c5cb68a7084e4ae7dcc60e6a98768720a81841e8/app/routes/contributions.js#L30-L34) evaluates three distinct request-body properties | Three source sinks; one shared class/root cause; do not automatically collapse the three line alerts |
| NodeGoat `open_redirect` | [`index.js` 72](https://github.com/OWASP/NodeGoat/blob/c5cb68a7084e4ae7dcc60e6a98768720a81841e8/app/routes/index.js#L69-L74) redirects to `req.query.url` | Context-supported candidate |
| NodeGoat `private_key` | [`artifacts/cert/server.key`](https://github.com/OWASP/NodeGoat/blob/c5cb68a7084e4ae7dcc60e6a98768720a81841e8/artifacts/cert/server.key#L1) contains a PEM private-key delimiter | Key material is present; **production sensitivity/exploitability and Critical impact remain unverified** in a training repository |
| Serverless-Goat `child_process_exec` | [`convert/index.js` 29](https://github.com/OWASP/Serverless-Goat/blob/39410bc3df8963d6544f98b50e8738ce3de1a188/src/api/convert/index.js#L29) interpolates `documentUrl` in a shell command | Strong candidate command injection; source-level impact requires context |
| DVNA `weak_hash` x2 | [`core/authHandler.js` 49, 78](https://github.com/appsecco/dvna/blob/9ba473add536f66ac9007966acb2a775dd31277a/core/authHandler.js#L41-L85) compares request reset tokens with `md5(req.query.login)` / `md5(req.body.login)` | Deterministic reset token with plausible account takeover; added a **specific** Critical contextual classification, not a blanket MD5 escalation |
| Snyk Goof `hardcoded_password` | [`mongoose-db.js` 52](https://github.com/snyk-labs/nodejs-goof/blob/add14ba59e98240d9e00a235dd7d42cd61ae9912/mongoose-db.js#L47-L53) seeds an admin user with a literal password | Actual hardcoded default password, but deliberately vulnerable demo's deployment impact needs review |
| Snyk Goof `debug_endpoint` | [`app.js` 56](https://github.com/snyk-labs/nodejs-goof/blob/add14ba59e98240d9e00a235dd7d42cd61ae9912/app.js#L52-L58) has `routes.isLoggedIn`; [middleware](https://github.com/snyk-labs/nodejs-goof/blob/add14ba59e98240d9e00a235dd7d42cd61ae9912/routes/index.js#L128-L134) verifies login, **not administrator role** | Do not blindly label FP or hide it. Keep as **context/authorization uncertain**, pending policy review |
| Firebase sample `cookie_missing_httponly` | [server sets CSRF helper cookie](https://github.com/firebase/quickstart-nodejs/blob/55f2ff5c17c730f7fc352f51a5264011de92fed0/auth-sessions/app.js#L73-L86), [browser reads `csrfToken` from `document.cookie`](https://github.com/firebase/quickstart-nodejs/blob/55f2ff5c17c730f7fc352f51a5264011de92fed0/auth-sessions/script.js#L75-L81) | Contextually expected JS-readable double-submit cookie; narrowly suppress only when both issuer and consumer context are present |
| Express test-only URL/cookie findings | Express test tree has HTTP URL, cookie test fixtures and intentionally unsafe strings | Added explicit network-call requirement for `http_url`; cookie findings in test folders remain visible at Low priority rather than disappearing |

## Engineering changes under PR #61

1. Emit exact `scannedFiles` path list (source-free, sorted) in each opt-in collection record; reject malformed path evidence and reject curated FN targets if no matching actual scanned file is proved. **Coverage gaps are not false negatives.**
2. Adjust `plaintext_password_storage` to point to the untransformed password field, not the opening object declaration.
3. Constrain `http_url` to explicitly recognized, direct literal `http://` client calls; inert URL parsing, documentation, fixture strings and local loopback URLs are filtered. **Known limitation:** alias, variable and multiline calls are not recognized.
4. Suppress a contextually verified, intentionally JS-readable CSRF-cookie helper only when the reader is also seen. Demote test-fixture cookie checks to Low, without removing them.
5. Keep `/admin` warnings reviewable until administrative authorization is established.
6. Upgrade only deterministic request-login-derived MD5 password-reset-token comparisons to Critical; unrelated MD5 remains a generic High review hint.
7. Preserve focused positive and negative regression cases in the required Phase 1–2 suite. Source scans are read-only and isolated from production.


## Uploaded per-finding Claude file: exact reconciliation

The user supplied `phase2_30_reviewer_queue_claude_review.json` after this document's original creation. Parsing the actual file confirms 112 unique original alert keys, labeled by **one AI reviewer** as 13 `true_positive`, 98 `false_positive`, 1 `uncertain`, 0 duplicates. Original ruleset `6050e354d24509eac3cfb7f95e6cbf96688c49f0`; all values are **proposals**, not independently adjudicated labels. The 38-alert scanner capture at `c18e2335005d8d805d8a067e7a0fff74b398acb8` has 37 exact identities in common, 73 removed `http_url` alerts, 1 removed intentionally readable CSRF cookie alert, and 1 NodeGoat raw-password finding moved from line 20 to the real line 25. **Do not compute or publish accuracy from this reused calibration corpus.**

The eight AI-reported missed candidates are explicitly checked against the new `scannedFiles` evidence:

| Candidate | Was source analyzed? | Source check and interpretation |
| --- | --- | --- |
| DVNA `core/appHandler.js:39` command injection | **No** | Request value concatenated to shell command, plausible source weakness; **coverage gap**, not a measured FN |
| DVNA `core/appHandler.js:188` redirect | **No** | Request URL forwarded to redirect, plausible source weakness; coverage gap |
| DVNA `core/appHandler.js:197` mathjs.eval | **No** | Request value enters mathjs evaluator; scope gap and semantics need specialist review |
| DVNA `server.js:27` cookie | **No** | Outside five-file subset; coverage gap |
| Goof `routes/index.js:174` shell command | **Yes** | `var item=req.body.content` → extracted URL → `exec('identify ' + url)`; strong in-scope command-injection candidate. Added bounded same-handler CommonJS alias and local taint test; no execution |
| Goof `routes/index.js:330` admin credential | **Yes** | Admin password initialized via `Math.random().toString(32)`; strong in-scope weak-randomness candidate, added positive/negative tests |
| NodeGoat `config/env/all.js:8–9` cookie/crypto secrets | **Yes** | Literal placeholder-looking strings, do **not** auto-label as an exploitable secret or silently classify clean without runtime context |
| NodeGoat `package.json:51` mutable GitHub tarball | **Yes** | `grunt-if` depends on moving `tarball/master` reference. Added `git_dependency` check and pinned-commit negative case; class differs from AI's `wildcard_dependency` label |

The 4/8 outside-scope candidates must never be presented as scanner false negatives. For the four in-scope candidates, **source-verified detection gaps are not a validated recall denominator** without independent reviews and supported-rule contracts; raw new alerts remain unreviewed. The specific fixes above were tested with safe positive/negative fixtures and are calibration, not sealed-holdout performance.

## Label definitions and review handoff

**Alert TP** means actionable security weakness in the observed execution context, not just lexically matching a rule. **FP** means demonstrably inert or safe under that context; uncertainty remains `uncertain`. **Duplicate** means a repeated finding at the *same underlying sink*, not three separate calls sharing one code smell. Alert-based precision and distinct-root-cause counts must be reported separately. Severity must be adjudicated independently from the existence of a weakness.

The original 30-repo selection has been used for rule tuning. It **cannot** be called an untouched holdout. The uploaded Claude JSON was subsequently received and reconciled as an **AI-only** source of proposals; human ground truth and a fresh untouched app-like Supabase/Next.js holdout are still required before calculating release-quality precision/recall.

**No external repository code was executed, and no production database, secrets, deployment, customer data or PR merge were modified for this review.**
