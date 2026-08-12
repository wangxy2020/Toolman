# Toolman Mobile

Expo / React Native client (`@toolman/mobile`). Isolated from Electron desktop.

## Docs

- [Architecture](../../docs/mobile/ARCHITECTURE.md)
- [Isolation](../../docs/mobile/ISOLATION.md)
- [Release](../../docs/mobile/RELEASE.md)

## Develop

```bash
pnpm --filter @toolman/shared build
pnpm --filter @toolman/sync-client build
pnpm --filter @toolman/mobile start
```

Prefer previewing on an **iPad simulator / device**, or a wide browser window.

Use **Node.js 20 or 22** (Expo SDK 57). Node 26 may work but is not the supported baseline.

After enabling Edge TTS API routes (`web.output: server`), restart Expo once with cache clear if routes 404:

```bash
pnpm --filter @toolman/mobile exec expo start --clear
```


If `expo start` fails with `Cannot find module 'expo-router/internal/routing'`, dependencies are out of sync — from `apps/mobile` run:

```bash
pnpm exec expo install expo-router @expo/metro-runtime expo-linking expo-constants
```

Do not enable `experiments.typedRoutes` until the installed `expo-router` exports `internal/routing`.

Browser (`w`) needs `react-native-web` (already in dependencies). After installing new packages, restart Expo and press `r` to reload.

## Feature flags (desktop adapters)

| Env / Settings | Effect |
|----------------|--------|
| Desktop **设置 → 系统诊断 → 移动端同步** | Toggle local Sync Hub + desktop host (persisted) |
| `TOOLMAN_MOBILE_SYNC=1` | Force-enable Sync Hub (overrides settings) |
| `TOOLMAN_MOBILE_AGENT_HOST=1` | Force-enable desktop host (requires sync) |
| `TOOLMAN_MOBILE_SYNC_PORT` | Optional Hub port (default `17890`) |
| `EXPO_PUBLIC_SYNC_BASE_URL` | Mobile Sync base URL (default `http://127.0.0.1:17890`) |

## Bundle IDs

- iOS / Android: `app.toolman.mobile`
