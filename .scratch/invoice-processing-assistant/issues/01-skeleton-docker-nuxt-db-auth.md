# 01 — Skeleton: Docker, Nuxt, Drizzle, Better Auth, Admin bootstrap

Status: resolved
Blocked by: none

## What
Stand up the runnable skeleton that every later slice builds on.

## Scope
- Nuxt 4 + TypeScript + pnpm, Tailwind v4, shadcn-vue, and Ledger Noir / Ledger Day theme tokens (CSS variables) with a stub theme toggle.
- Folder layout:
  - `server/api`
  - `server/db` (Drizzle schema + drizzle-kit migrations)
  - `server/domain` (no Nuxt imports; add a lint rule or test that enforces this)
  - `server/worker.ts` (pg-boss boots and idles)
- Drizzle schema for the Better Auth tables, plus `user.role` (`admin` | `user`) and instance settings (sign-up policy, Document limits).
- Better Auth:
  - email/password with verification (SMTP from env; warn and skip verification when SMTP is absent)
  - Google and GitHub OAuth (enabled when their env credentials are present)
  - TOTP 2FA and sessions
- The first User to sign up becomes Admin. The sign-up policy (`open` | `invite-only`) is enforced.
- Pages: `/auth/*`, the auth-guarded `/app` layout (sidebar, topbar, empty downloads drawer), a placeholder `/app` dashboard, `/app/settings/profile`, `/app/settings/security`.
- Docker:
  - multi-stage `node:22-alpine` Dockerfile
  - Compose with `app`, `worker`, `postgres:16`, `minio`, `minio-init`, and `ollama` (profile)
  - `docker-compose.dev.yml` with hot reload
  - migrations run on app start
  - `.env.example`, including `ENCRYPTION_KEY`
- Vitest and Playwright wired up; `pnpm test` is ready for CI.

## Acceptance
- `docker compose up` → sign up the first User → that User is Admin → sign out and back in works. A second sign-up is blocked when the policy is invite-only.
- The worker container starts and connects to pg-boss.
- Playwright: sign-up → land on `/app`.
