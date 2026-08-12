# Mobile ↔ Desktop isolation rules

## Hard constraints

1. `apps/mobile` **must not** import:
   - `electron`
   - `apps/desktop/**`
   - `better-sqlite3`
   - any `*.node` native addon
   - desktop main-process IPC helpers
2. Prefer `@toolman/shared/mobile` over `@toolman/shared` root in mobile code (root may grow Node-only helpers; mobile entry excludes them).
3. CI job `mobile-check` is **independent** of desktop release. A red mobile job must not block desktop packaging.
4. Do not change `electron-builder.yml` or desktop native build scripts for mobile features.
5. Sync / agent-host adapters on desktop are **feature-flagged** (`TOOLMAN_MOBILE_SYNC=1` / settings flag) and must fail closed without corrupting local-first data.

## Allowed shared packages

- `@toolman/shared/mobile` — Zod contracts, auth/community enums, sync + host schemas
- `@toolman/sync-client` — fetch-based Sync/Host API client (no Node fs)

## Dependency guard

ESLint `no-restricted-imports` in `apps/mobile` blocks `electron`, `apps/desktop`, `better-sqlite3`.
