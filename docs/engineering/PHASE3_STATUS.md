# Phase 3 状态（GA 发布）

> **前置**：Phase 0–2 出口满足 · 更新：2026-06-22  
> **目标**：[GA_DEVELOPMENT_PLAN.md](./GA_DEVELOPMENT_PLAN.md) §Phase 3

---

## 进度总览

| # | 任务 | 状态 | 说明 |
|---|------|------|------|
| 3.1 | macOS/Windows 签名包 | ☐ | 需 Apple Developer + Authenticode 凭据 |
| 3.2 | stable CDN manifest | ☐ | `release:verify-feed` stable 通道 |
| 3.3 | README 去 Beta，版本 `0.2.0` | ☐ | 公开文档与 About 一致 |
| 3.4 | 回滚演练 | ☐ | 上一 GA manifest 可回退 |
| 3.5 | GA 公告 + 已知限制 | ☐ | WAN/TURN、ICE 限制等 |

---

## 前置检查（Phase 0–2 出口）

| Phase | 必达项 | 状态 |
|-------|--------|------|
| 0 | dogfood ≥7 天 · P0=0 · OTA staging 绿 | 🔄 / ☐ |
| 1 | 1.6 Hub signed catalog · 1.7 人工 WAN 签字 · 1.1 WAN ICE | 🟡 / ☐ / ☐ |
| 2 | 覆盖率 25% · chaos · ipc <600 · structured log | ✅ |

---

## 发布命令速查

```bash
# RC1 / staging（Phase 0）
pnpm rc1:preflight && pnpm rc1:build
pnpm release:verify-feed https://releases.toolman.app staging darwin arm64

# GA stable（Phase 3）
pnpm release:verify-feed https://releases.toolman.app stable darwin arm64
# 见 RELEASE_CHECKLIST.md · GITHUB_RELEASE.md
```

---

## 关联文档

- [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md)
- [GITHUB_RELEASE.md](./GITHUB_RELEASE.md)
- [RC1_DOGFOOD.md](./RC1_DOGFOOD.md)
