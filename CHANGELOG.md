# Change Log

Short, human-readable notes for contributors and reviewers.

## 2026-07-26 (session 2)

### Supabase credentials wired up

- Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as shared Replit environment variables (read from `artifacts/vibeguard/.env.example`).
- Restarted the VibeGuard frontend workflow; browser console clean, landing page loads without errors.
- Note: `DATABASE_URL` (Postgres connection for the API server) is runtime-managed by Replit — no manual action needed for that key.

## 2026-07-26

### Project setup

- Installed the locked pnpm workspace dependencies and verified the VibeGuard web preview, API server, and mockup preview workflows.
- Added secure Supabase configuration through the Replit Secrets `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- Added a placeholder environment template at `artifacts/vibeguard/.env.example`; no credential values are committed.
- Added startup validation for the Supabase URL and documented the required environment variables in `replit.md`.
- Verified workspace typechecking and the VibeGuard production build.

### Contributor workflow

- Documented the project convention to update this changelog after each change and push the summary to GitHub.