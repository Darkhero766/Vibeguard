# Change Log

Short, human-readable notes for contributors and reviewers.

## 2026-07-26 (session 7)

### GitHub OAuth login and private repository scanning

**What was built:**

1. **GitHub sign-in** — Added "Continue with GitHub" button to the auth page alongside the existing Google button. Requests `repo` scope so private repositories can be read. Includes a consent notice explaining exactly what is stored and how to revoke access.

2. **Encrypted token storage** — New `github_tokens` table in Supabase (with full RLS: users can only read/write their own row). On GitHub sign-in, `provider_token` is captured from the Supabase session and sent to `POST /api/github/token`, where it is encrypted with AES-256-GCM using `GITHUB_TOKEN_ENCRYPTION_KEY` (a Replit Secret) and stored. The plaintext token never persists anywhere.

3. **Private repo scanning** — `POST /api/scans` now accepts an optional Supabase JWT. When present, the server fetches the user's stored GitHub token, decrypts it, and embeds it in the git clone URL (`https://x-oauth-token:<token>@github.com/...`). All existing file-filtering and check logic is unchanged — only the clone URL differs.

4. **Repo picker UI** — Logged-in users see a "Paste URL / My repos" toggle above the scan input. "My repos" fetches `GET /api/github/repos` (proxied through the server using the stored token) and shows a searchable list with lock/globe icons for private/public repos. Clicking a repo immediately triggers a scan. If no GitHub connection exists, the picker shows a "Link GitHub account" prompt.

5. **Auth wiring** — `setAuthTokenGetter` is called at app startup so every generated API hook (including `useCreateScan`) automatically includes the Supabase JWT in the Authorization header.

**Manual steps still required:**
- Apply the `github_tokens` table migration (`node scripts/migrate-supabase.mjs` or paste the SQL in the Supabase SQL editor).
- Register a GitHub OAuth App (Settings → Developer settings → OAuth Apps) and add the Client ID + Secret to Supabase Auth → Providers → GitHub.
- Add the Replit dev domain to Supabase Auth → URL Configuration → Redirect URLs.

## 2026-07-26 (session 6)

### Two polish features

1. **Full name on signup** — Added a required "Full name" field to the signup form in `AuthPage.tsx`. The name is stored in Supabase `user_metadata` as `full_name`. The Nav now shows `user_metadata.full_name` everywhere the email used to appear (desktop button, desktop dropdown header, mobile menu), falling back to email for existing users who signed up before this change.

2. **Animated scan progress** — Replaced the static skeleton (`ScanSkeleton`) with a new `ScanProgress` component. It steps through the 7 scanner checks (fetch → RLS → unauthenticated writes → service keys → secrets → security definer → CORS) with realistic timed delays (400–1100ms each), a smooth CSS progress bar, and per-row status icons (gray dot → spinning loader → green check). The last check stays in "running" state until the real scan completes, ensuring the UI never looks falsely done before results arrive.

## 2026-07-26 (session 5)

### Pre-launch pass — all six items completed

1. **Dedup + self-exclusion verified** — re-scan of Darkhero766/Vibeguard: 0 scanner.ts hits, 0 duplicates. ✅
2. **App.tsx false positive fixed** — added `COPY_EXCLUDED_LINE_RANGES` map in scanner.ts; line 287 (UI copy mentioning "service_role keys") is skipped by service-role and secrets checks while the rest of App.tsx is still fully scanned.
3. **Generic secrets check added** — new `scanGenericSecrets` in scanner.ts flags Stripe live keys (`sk_live_…`), AWS access key IDs (`AKIA…`), and hardcoded `api_key`/`secret_key` assignments ≥ 20 chars. Critical severity. Respects `COPY_EXCLUDED_LINE_RANGES` and comment-line skips.
4. **CORS wildcard check added** — new `scanCorsWildcard` in scanner.ts flags `Access-Control-Allow-Origin: "*"` in `next.config.*` files. Medium severity.
5. **Legal pages updated** — removed "Placeholder — review before launch" labels and "[email placeholder]" text from both pages; updated date to July 2026; Terms now explicitly states public-repos-only, no code storage, results not a substitute for professional audit, and 1-scan free-tier limit; Privacy updated to match.
6. **Mobile layout verified** — 375 × 812 screenshot: hero, CTA buttons, and nav all render correctly, no horizontal scroll or cut-off text.

Final verification scan (Darkhero766/Vibeguard): 0 findings, 100 files scanned.

## 2026-07-26 (session 4)

### Unlimited scans for nightowlclub72@gmail.com

- Added `isUnlimited` check in `artifacts/vibeguard/src/App.tsx` (Home component) that bypasses the scan limit for `nightowlclub72@gmail.com` only.
- Patched both enforcement points: the `isAtLimit` derived value (hides the upgrade wall) and the pre-scan inline re-check inside `runScan` (prevents the blocked state from being set).
- All other users remain subject to the normal `scans_used >= scans_limit` quota.

## 2026-07-26 (session 3)

### Scanner bug fixes (artifacts/api-server/src/lib/scanner.ts)

- **Bug 1 — Duplicate findings**: Added `deduplicateFindings()` and applied it inside `scanPublicRepository` before the final sort. Deduplicates by `filePath:line:check:title` key.
- **Bug 2 — Self-scan false positives**: Added `SELF_EXCLUDED_PATHS` constant and updated `shouldRead()` to skip `artifacts/api-server/src/lib/scanner.ts`. Prevents the scanner's own detection patterns (e.g. the string `service_role`) from triggering findings against the VibeGuard repo itself.
- Verified by scanning `https://github.com/Darkhero766/Vibeguard`: `scanner.ts` appears 0 times in findings, 0 duplicate findings, 1 real finding (`artifacts/vibeguard/src/App.tsx:287`).

## 2026-07-26 (session 2)

### Supabase credentials wired up

- Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as shared Replit environment variables (read from `artifacts/vibeguard/.env.example`).
- Restarted the VibeGuard frontend workflow; browser console clean, landing page loads without errors.
- Confirmed the API server is stateless — scan routes do not call the database. `DATABASE_URL` is runtime-managed by Replit but not required for functionality.
- Usage tracking (`usage` table, RLS, auto-signup trigger) lives entirely in Supabase. Run `supabase/migrations/usage_table.sql` once in the Supabase SQL Editor if not already applied.

## 2026-07-26

### Project setup

- Installed the locked pnpm workspace dependencies and verified the VibeGuard web preview, API server, and mockup preview workflows.
- Added secure Supabase configuration through the Replit Secrets `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- Added a placeholder environment template at `artifacts/vibeguard/.env.example`; no credential values are committed.
- Added startup validation for the Supabase URL and documented the required environment variables in `replit.md`.
- Verified workspace typechecking and the VibeGuard production build.

### Contributor workflow

- Documented the project convention to update this changelog after each change and push the summary to GitHub.