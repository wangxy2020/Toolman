# Contributing to Toolman

## Prerequisites

- Node.js 20+
- pnpm 9+
- Rust stable (for native P2P / community hub builds)

## Setup

```bash
pnpm install
pnpm --filter @toolman/desktop predev   # first-time native + workspace build
pnpm dev
```

Dual P2P dev instances:

```bash
pnpm dev:p2p:a
pnpm dev:p2p:b
```

## Quality gates

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @toolman/desktop test:p2p-integration
```

Before opening a PR, run `bash scripts/smoke-critical-paths.sh` when touching core flows.

## Code organization

- IPC contracts live in `packages/shared/src/ipc`
- Main-process handlers are registered via `apps/desktop/src/main/ipc/register-handlers.ts`
- Renderer must not import `@toolman/db` or native modules directly

## Security defaults

- Packaged builds must not enable auth/billing dev modes
- File-path IPC must go through `path-sandbox.service.ts`
- Agent `bash` must not inherit secrets from `process.env`

## Commits

Use concise messages focused on **why** the change is needed. Keep PRs small and domain-scoped when possible.
