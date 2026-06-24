# Toolman RC → GA Release Checklist

Use this checklist before tagging a Release Candidate or General Availability build.

## RC1 kickoff (internal dogfood)

See **[RC1_DOGFOOD.md](./RC1_DOGFOOD.md)** for the full runbook.

- [ ] `pnpm rc1:preflight` green on release branch
- [ ] Version is `0.2.0-rc.1` (or current `-rc.N`) in `apps/desktop/package.json`
- [ ] `pnpm rc1:build` produces signed/notarized dmg (or document Gatekeeper waiver)
- [ ] Internal distribution list + dedicated `--user-data-dir` instructions sent
- [ ] Daily dogfood table + defect tracker started (≥ 1 week)
- [ ] RC1 exit criteria reviewed before RC2

## Build & signing

- [ ] Version bumped in `apps/desktop/package.json` and lockfile consistent
- [ ] `pnpm smoke` green on release branch
- [ ] `pnpm --filter @toolman/desktop test:e2e` green (macOS recommended)
- [ ] `pnpm release:verify-feed https://releases.toolman.app staging` green after staging publish
- [ ] macOS: code sign + notarization complete
- [ ] Windows: Authenticode signing complete
- [ ] `TOOLMAN_*_DEV_MODE` unset in release env
- [ ] `TOOLMAN_BILLING_MOCK=0` for production channel
- [ ] `TOOLMAN_COMMUNITY_HUB_URL` points to staging/production Hub (not `127.0.0.1`)
- [ ] TURN credentials injected (`TOOLMAN_P2P_TURN_*` or `network.json`)
- [ ] `TOOLMAN_UPDATE_FEED_URL` configured for auto-update manifest

## Functional smoke (manual)

- [ ] **Login**: CN or Global auth path succeeds on a clean profile
- [ ] **Chat**: create session, send message, streaming response (or provider error is explicit)
- [ ] **Knowledge**: create KB, import file, FTS search returns results
- [ ] **Community**: browse market list, Hub health OK (or offline banner + cache read-only)
- [ ] **P2P dual instance**: `./scripts/p2p-dual-node-e2e.sh` checklist signed off
- [ ] **WAN** (staging): two machines cross-NAT join same group with TURN

## RC phases (R4.3)

1. **RC1** — internal dogfood ≥ 1 week
2. **RC2** — limited external beta
3. **GA** — stable CDN manifest + README removes Beta label

## Diagnostics before ship

- [ ] Settings → 系统诊断: libp2p running, Hub mode/URL correct
- [ ] Settings → 系统诊断: 崩溃上报 opt-in 行为符合预期（默认关闭）
- [ ] About → check update channel (`stable` / `staging`)
- [ ] Crash reports directory empty or opt-in upload verified

## Rollback

- [ ] Previous GA build + manifest archived on CDN
- [ ] `minVersion` in update manifest not raised until adoption confirmed
