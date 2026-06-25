# ADR 001: IPC Handler Registry

## Status

Accepted (2026-06)

## Context

`handlers.ts` grew beyond 1,900 lines, mixing channel definitions, service imports, and registration logic.

## Decision

1. Keep the handler map in `apps/desktop/src/main/ipc/handlers/ipc-handler-map.ts`
2. Move registration to `apps/desktop/src/main/ipc/register-handlers.ts`
3. Introduce `handler-types.ts` for shared handler map types

Future work can split `ipc-handler-map.ts` by domain (`app`, `knowledge`, `p2p`, etc.) without changing renderer imports.

## Consequences

- `main/index.ts` imports `registerIpcHandlers` from `register-handlers.ts`
- Auth gating and Zod error wrapping remain centralized at registration time
- Domain-level handler files can be added incrementally
