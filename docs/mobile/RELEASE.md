# Toolman Mobile release

## Identity

| Field | Value |
|-------|-------|
| Display name | Toolman |
| npm package | `@toolman/mobile` |
| Expo slug | `toolman-mobile` |
| iOS bundle id | `app.toolman.mobile` |
| Android applicationId | `app.toolman.mobile` |
| Versioning | Independent of desktop (semver in `apps/mobile/app.json`) |

## Channels

1. **Dev** — `pnpm --filter @toolman/mobile start` (Expo Go / dev client)
2. **Internal** — TestFlight + Play Internal testing
3. **Production** — App Store + Google Play (separate certs from desktop)

## Privacy & security

- API keys in SecureStore (Keychain / Keystore), never in AsyncStorage plaintext.
- Sync traffic over HTTPS + account JWT.
- Crash reporting channel separate from desktop (`mobile` app id).
- Privacy nutrition labels / Play Data safety must list account, sync, and optional crash data.
- Details: [PRIVACY.md](./PRIVACY.md).

## Out of band from desktop GA

Desktop `RELEASE_STATUS.md` / `rc1:preflight` do **not** gate mobile. Mobile checklist lives here.
