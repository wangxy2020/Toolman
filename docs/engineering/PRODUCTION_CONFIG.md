# Toolman 生产环境配置

> **用途**：GA 发行包、官方 Hub 与 Desktop 客户端的生产 env 清单  
> **关联**：[PRODUCTION_RELEASE_PLAN.md](./PRODUCTION_RELEASE_PLAN.md) · 根目录 `.env.production.example`

## 原则

1. **Release 包禁止 dev 捷径**：SMS 固定码、微信假用户、Authing dev 模式、Billing mock 均不可在生产默认开启。
2. **未配置即拦截**：认证 Provider 未配置时，UI 必须明确报错（已有 `AuthLoginError` 文案），不得静默降级为 dev 账户。
3. **密钥不入库**：所有 secret 通过 CI/CD 或 OS 密钥链注入，不写入 `.env.production.example` 占位值以外的真实密钥。

---

## Desktop — `TOOLMAN_*`

### 构建与发行

| 变量 | 生产值 | 说明 |
|------|--------|------|
| `TOOLMAN_AUTH_BUILD_REGION` | `cn` 或 `global` | 按发行渠道打包；`global` 同时暴露 CN+Intl 登录 |
| `TOOLMAN_BUILD_REGION` | 同左 | 别名 |

### 认证 — 国内（CN）

| 变量 | 生产值 | 说明 |
|------|--------|------|
| `TOOLMAN_AUTHING_DEV_MODE` | **未设置或 `0`** | `1` 仅本地开发 |
| `TOOLMAN_AUTHING_APP_ID` | **必填** | Authing 应用 ID |
| `TOOLMAN_AUTHING_USER_POOL_ID` | 条件必填 | 与应用 ID 不同时 |
| `TOOLMAN_AUTHING_APP_SECRET` | **必填** | |
| `TOOLMAN_AUTHING_APP_HOST` | **必填** | 如 `https://xxx.authing.cn` |
| `TOOLMAN_AUTHING_OAUTH_CALLBACK_PORT` | 可选 | 默认 `42873` |
| `TOOLMAN_AUTHING_OTP_TTL_SECONDS` | 可选 | 默认 `120` |
| `TOOLMAN_TENCENT_SMS_DEV_MODE` | **未设置或 `0`** | `1` 时固定验证码 `123456` |
| `TOOLMAN_WECHAT_DEV_MODE` | **未设置或 `0`** | `1` 时假微信用户 |
| `TOOLMAN_TENCENT_SECRET_ID` | legacy 备选 | Authing 未配时使用 |
| `TOOLMAN_TENCENT_SECRET_KEY` | legacy 备选 | |
| `TOOLMAN_TENCENT_SMS_*` | legacy 备选 | SDK AppId / Sign / Template |
| `TOOLMAN_WECHAT_OPEN_APP_ID` | legacy 备选 | |
| `TOOLMAN_WECHAT_OPEN_APP_SECRET` | legacy 备选 | |

### 认证 — 国际（Firebase）

| 变量 | 生产值 | 说明 |
|------|--------|------|
| `TOOLMAN_FIREBASE_API_KEY` | **必填**（global 包） | |
| `TOOLMAN_FIREBASE_AUTH_DOMAIN` | **必填** | |
| `TOOLMAN_FIREBASE_PROJECT_ID` | **必填** | |
| `TOOLMAN_FIREBASE_APP_ID` | **必填** | |

### 社区 JWT（嵌入式 sidecar 或 token 缓存）

| 变量 | 生产值 | 说明 |
|------|--------|------|
| `TOOLMAN_COMMUNITY_JWT_SECRET` | **必填**（强随机） | 勿使用 dev 脚本默认值 |
| `TOOLMAN_COMMUNITY_DATA_DIR` | 可选 | 双实例 dev 用；GA remote Hub 模式下可忽略 |

### 计费（占位 — D5 不做，但须关闭 mock）

| 变量 | 生产值 | 说明 |
|------|--------|------|
| `TOOLMAN_BILLING_MOCK` | **`0`** | 禁止 Release 包 mock 支付 |
| `TOOLMAN_BILLING_API_URL` | 未实现 | 设置且 mock=0 时升级入口应禁用或提示 |

### P2P 双实例开发（非生产）

| 变量 | 说明 |
|------|------|
| `TOOLMAN_P2P_USER_A_DATA` / `TOOLMAN_P2P_USER_B_DATA` | 仅 `dev:p2p:a/b` 脚本 |
| `TOOLMAN_P2P_USER_*_KB` | 联调知识库路径 |

### P2P / WebRTC（WAN 协作 · R2.3）

| 变量 | 生产值 | 说明 |
|------|--------|------|
| `TOOLMAN_P2P_ICE_SERVERS` | JSON 数组 | 覆盖 `{userData}/p2p/network.json`；含 STUN + TURN |
| `TOOLMAN_P2P_STUN_SERVERS` | 逗号分隔 | 与 `TOOLMAN_P2P_TURN_URL` 组合使用 |
| `TOOLMAN_P2P_TURN_URL` | **GA 必填** | 如 `turn:turn.toolman.app:3478?transport=udp` |
| `TOOLMAN_P2P_TURN_USERNAME` | **必填** | TURN 长期凭证用户名 |
| `TOOLMAN_P2P_TURN_CREDENTIAL` | **必填** | TURN 长期凭证密码 |

示例：

```json
[
  { "urls": "stun:stun.l.google.com:19302" },
  {
    "urls": ["turn:turn.toolman.app:3478?transport=udp", "turn:turn.toolman.app:3478?transport=tcp"],
    "username": "toolman",
    "credential": "<secret>"
  }
]
```

| 文件 | GA 默认 |
|------|---------|
| `{userData}/p2p/network.json` | `iceServers` 含 STUN + TURN（或通过 env 注入） |

**开发 / RC1 WAN 冒烟测试**（Metered OpenRelay，公开凭据，**不可用于 GA 生产**）：

| 项 | 值 |
|----|-----|
| STUN | `stun:staticauth.openrelay.metered.ca:80` |
| TURN | `turn:staticauth.openrelay.metered.ca:80` · `:443` · `turns:…:443` |
| 用户名 | `openrelayproject` |
| 密码 | `openrelayprojectsecret` |

完整模板：[templates/p2p-network.openrelay.json](./templates/p2p-network.openrelay.json)  
一键安装：`cp docs/engineering/templates/env.p2p.turn.example .env.p2p.turn && pnpm rc1:wan-prep`

### 自动更新（R1.1）

| 变量 | 生产值 | 说明 |
|------|--------|------|
| `TOOLMAN_UPDATE_FEED_URL` | **Release 必填** | CDN 根 URL，如 `https://releases.toolman.app` |
| `TOOLMAN_UPDATE_CHANNEL` | `stable` / `staging` | 默认 `stable`；staging 先行验证 |

### Desktop Hub 连接（R3.1）

| 变量 | 生产值 | 说明 |
|------|--------|------|
| `TOOLMAN_COMMUNITY_HUB_URL` | `https://hub.toolman.app` | 强制远程 Hub baseUrl |
| `TOOLMAN_COMMUNITY_HUB_MODE` | `remote` / `local` | Release 默认 remote；开发默认 local sidecar |

远程清单：`{TOOLMAN_UPDATE_FEED_URL}/{channel}/manifest.json`

```json
{
  "version": "0.2.0",
  "url": "https://releases.toolman.app/stable/darwin/arm64/Toolman-0.2.0.dmg",
  "sha256": "<hex>",
  "notes": "更新说明（每行一条）",
  "minVersion": "0.1.0"
}
```

同目录下由 `electron-builder publish` 生成 `latest-mac.yml` / `latest.yml` 供 `electron-updater` 下载。

发布流程见 [OTA_RELEASE.md](./OTA_RELEASE.md)。

| Secret / 变量 | 说明 |
|---------------|------|
| `TOOLMAN_UPDATE_S3_BUCKET` | CDN bucket（GitHub Actions publish） |
| `TOOLMAN_UPDATE_S3_ENDPOINT` | R2 等兼容 S3 endpoint |
| `TOOLMAN_UPDATE_AWS_ACCESS_KEY_ID` / `SECRET` | 上传凭据 |

| 文件 | 说明 |
|------|------|
| `{userData}/updates/preferences.json` | 用户「自动更新」开关 |
| `{userData}/updates/manifest.json` | 最近一次拉取的清单缓存（诊断页可读） |

### 崩溃上报（R1.2）

| 变量 | 生产值 | 说明 |
|------|--------|------|
| `TOOLMAN_CRASH_REPORT_URL` | 可选 | 完整 ingest URL；默认 `{Hub}/api/v1/diagnostics/crashes` |

| 文件 | 说明 |
|------|------|
| `{userData}/diagnostics/preferences.json` | 用户「上传崩溃报告」opt-in（默认 `false`） |
| `{userData}/diagnostics/crashes/*.json` | 本地崩溃快照；上传成功后删除 |

### 其他

| 变量 | 说明 |
|------|------|
| `TOOLMAN_DOCS_ROOT` | 可选；文档/文件夹验证脚本 |

---

## Community Hub — `COMMUNITY_HUB_*`

> GA（D1）：Desktop **remote 模式**连 `https://hub.toolman.app`；下列变量主要用于**官方 Hub 服务端**部署。

| 变量 | 生产值 | 说明 |
|------|--------|------|
| `COMMUNITY_HUB_DATA_DIR` | **必填**（服务端） | SQLite + packages 根 |
| `COMMUNITY_HUB_PORT` | `443` 或反代后端端口 | 客户端连 HTTPS 443 |
| `COMMUNITY_HUB_JWT_SECRET` | **必填** | 与 Desktop `TOOLMAN_COMMUNITY_JWT_SECRET` 协商一致 |
| `COMMUNITY_HUB_REQUIRE_REVIEW` | 建议 `true` | 发布审核 |
| `COMMUNITY_HUB_RATE_LIMIT_RPM` | 建议 `600` | `0` 关闭限流 |
| `COMMUNITY_HUB_SEMANTIC_SEARCH` | **`0` 或未设置** | GA 不用（D4 → v1.1） |
| `COMMUNITY_HUB_EMBEDDING_URL` | 未设置 | v1.1 |
| `COMMUNITY_HUB_CONFIG_FILE` | 可选 | JSON 覆盖 |
| `COMMUNITY_HUB_DEFAULT_IDENTITY_ID` | 种子管理员 | 仅首次 bootstrap |

---

## Desktop 本地配置（非 env，GA 策略）

路径均在 `{userData}` 下：

| 文件 | GA 默认 | 说明 |
|------|---------|------|
| `community/hub.json` | `{ "mode": "remote", "baseUrl": "https://hub.toolman.app" }` | Release 自动写入；开发默认 `local` |
| `community/sync.json` | `yjsEnabled: true`, `requireSignedUpdates: true` | Release 默认 |
| `community/cid.json` | `cidDistributionEnabled: true` | Release 默认 |
| `community/cache/*.json` | — | Hub 离线只读缓存 |
| `p2p/libp2p.json` | `mdnsEnabled: true`, `dhtMode: client` | |
| `p2p/network.json` | 含 **TURN** iceServers | R2.3 |

---

## Release 包自检清单

- [ ] `TOOLMAN_*_DEV_MODE` 均未设置为 `1`
- [ ] `TOOLMAN_BILLING_MOCK=0` 或等价 `isPackaged` 守卫
- [ ] Firebase / Authing 至少一条路径已配置
- [ ] 官方 Hub URL 指向 production/staging 而非 `127.0.0.1`
- [ ] TURN credentials 已注入（WAN 承诺 D2）
- [ ] 代码签名 + notarization（macOS）完成

---

## 开发 vs 生产对照

| 能力 | 开发 (`.env.local`) | 生产 (`.env.production.example`) |
|------|---------------------|----------------------------------|
| SMS | `TOOLMAN_TENCENT_SMS_DEV_MODE=1` 可选 | **关闭** |
| 微信 | `TOOLMAN_WECHAT_DEV_MODE=1` 可选 | **关闭** |
| Authing | `TOOLMAN_AUTHING_DEV_MODE=1` 可选 | **关闭** |
| Billing | mock 默认开 | **`TOOLMAN_BILLING_MOCK=0`** |
| Hub | 本地 sidecar `:3721` | **`https://hub.toolman.app`** |
| 语义搜索 | 可开 flag 测 501 | **FTS only（GA）** |
