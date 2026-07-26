# VibeGuard

VibeGuard scans public Next.js + Supabase repositories for three high-signal security issues without running repository code.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env:
  - `VITE_SUPABASE_URL` — Supabase project URL, stored as a Replit Secret
  - `VITE_SUPABASE_ANON_KEY` — Supabase anon/public key, stored as a Replit Secret
  - `DATABASE_URL` — Postgres connection string for the API server

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/vibeguard` — React/Vite single-page interface and report flow
- `artifacts/api-server/src/lib/scanner.ts` — stateless Git object reader and deterministic checks
- `artifacts/api-server/src/routes/scans.ts` — scan endpoint
- `lib/api-spec/openapi.yaml` — source of truth for the scan contract

## Architecture decisions

- Repository input is limited to public `github.com/owner/repo` URLs.
- Scans use a shallow Git fetch with `--no-checkout`, inspect only tracked JS/TS/SQL blobs, and always remove the temporary directory.
- No repository dependencies, hooks, scripts, or application code are executed.
- The scan is stateless; findings are returned directly and never persisted.

## Product

Users can submit a public GitHub repository, review findings for disabled Supabase RLS, unauthenticated API database writes, and client-side service_role references, re-scan, and copy a text report.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- GitHub fetches can take up to two minutes for a large public repository and are bounded by file and byte limits.
- Run `pnpm --filter @workspace/api-spec run codegen` after changing the OpenAPI contract.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
