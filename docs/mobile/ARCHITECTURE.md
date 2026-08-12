# Toolman Mobile Architecture

> App: `apps/mobile` (Expo / React Native) · Package: `@toolman/mobile` · Bundle ID: `app.toolman.mobile`

## Goals

- Independent iOS/Android client, same account as desktop (`identity_id`).
- API LLMs primary; on-device models optional and secondary.
- Sync selected entities with desktop via Hub-backed Sync API.
- Invoke desktop agents (chat / classroom / project-management) when the desktop is online as `agentHost`.

## Process boundaries

| Layer | Mobile | Desktop |
|-------|--------|---------|
| UI | Expo RN three-pane shell | Electron React |
| Local cache | `expo-sqlite` / SecureStore | `better-sqlite3` |
| Contracts | `@toolman/shared/mobile` | `@toolman/shared` |
| Sync / relay client | `@toolman/sync-client` | same package + main adapters |
| Native P2P / MCP / LanceDB / Hub sidecar | **Not embedded** | Owned by desktop |

## Data planes

1. **Account** — Auth V2 JWT; presence `deviceKind: 'mobile'`.
2. **Sync** — changeset push/pull for assistants, sessions/messages, notes (Phase 2+).
3. **Host relay** — mobile → Sync/Hub → desktop agent runtime (Phase 3+).

## UI shell

- Top bar: module switcher + account/sync status
- Main column (100% width): streaming messages / detail + input composer
- Left drawer: overlay layer sliding from the left (sessions / module lists); closed by default
- Settings: docked left tabs (always visible, cannot dismiss) + right panels

## Isolation

See [ISOLATION.md](./ISOLATION.md). Desktop GA gates stay in `docs/engineering/`; mobile release in [RELEASE.md](./RELEASE.md).
