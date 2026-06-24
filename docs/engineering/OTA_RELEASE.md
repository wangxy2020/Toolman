# Toolman Desktop OTA / CDN Release

> **关联**：[PRODUCTION_CONFIG.md](./PRODUCTION_CONFIG.md) · [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md)

## CDN 目录结构

Base URL（示例）：`https://releases.toolman.app`

```
{feed}/
  staging/
    manifest.json                 # About 页检查用（自定义 schema）
    darwin/
      arm64/
        latest-mac.yml            # electron-updater generic provider
        Toolman-0.2.0-arm64.dmg
      x64/
        latest-mac.yml
        Toolman-0.2.0-x64.dmg
    win32/
      x64/
        latest.yml
        Toolman-0.2.0-x64.exe
  stable/
    ...
```

客户端配置：

| 变量 | 说明 |
|------|------|
| `TOOLMAN_UPDATE_FEED_URL` | CDN 根 URL；Release 构建默认烘焙为 `https://releases.toolman.app` |
| `TOOLMAN_UPDATE_CHANNEL` | `staging` / `stable`；Release 构建时写入 |
| `TOOLMAN_UPDATE_PUBLISH_URL` | 构建时传给 electron-builder 的 generic publish 前缀 |

## 本地构建 Release 包

```bash
# 仅打包 + 生成本地 manifest（不上传）
TOOLMAN_UPDATE_CHANNEL=staging \
TOOLMAN_RELEASE_NOTES="RC1 staging build" \
bash scripts/build-desktop-release.sh
```

产物：

- `apps/desktop/dist/Toolman-{version}-{arch}.dmg|exe`
- `apps/desktop/dist/latest-mac.yml` 或 `latest.yml`
- `apps/desktop/dist/staging-manifest.json`

## 上传到 CDN（S3 / R2）

```bash
export TOOLMAN_UPDATE_S3_BUCKET=toolman-releases
export TOOLMAN_UPDATE_S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com   # R2 示例
export TOOLMAN_UPDATE_AWS_ACCESS_KEY_ID=...
export TOOLMAN_UPDATE_AWS_SECRET_ACCESS_KEY=...

TOOLMAN_UPDATE_CHANNEL=staging \
TOOLMAN_UPDATE_PLATFORM=darwin \
TOOLMAN_UPDATE_ARCH=arm64 \
bash scripts/publish-update-feed.sh
```

或在构建时一并上传：

```bash
TOOLMAN_UPDATE_CHANNEL=staging \
TOOLMAN_RELEASE_PUBLISH=1 \
bash scripts/build-desktop-release.sh
```

## 验证 staging OTA

```bash
bash scripts/verify-update-feed.sh https://releases.toolman.app staging darwin arm64
```

期望：

1. `GET .../staging/manifest.json` 返回 `version` / `url` / `sha256`
2. `GET .../staging/darwin/arm64/latest-mac.yml` 含 `version:` 字段

## GitHub Actions

Workflow：`.github/workflows/release-desktop.yml`

| 触发 | 行为 |
|------|------|
| `workflow_dispatch` | 选择 channel、是否 publish、release notes |
| `push tag v*` | 构建 stable 渠道 artifact（默认不上传，除非配置 secrets + manual 扩展） |

所需 Secrets（publish 时）：

| Secret | 说明 |
|--------|------|
| `TOOLMAN_UPDATE_S3_BUCKET` | Bucket 名 |
| `TOOLMAN_UPDATE_S3_ENDPOINT` | R2 / 兼容 S3 endpoint（AWS S3 可留空） |
| `TOOLMAN_UPDATE_S3_PREFIX` | 可选 key 前缀 |
| `TOOLMAN_UPDATE_AWS_ACCESS_KEY_ID` | 上传凭据 |
| `TOOLMAN_UPDATE_AWS_SECRET_ACCESS_KEY` | 上传凭据 |

## Staging 实测清单

- [ ] `workflow_dispatch` → channel=`staging` → 产物 artifact 下载可安装
- [ ] publish 后 `verify-update-feed.sh` 通过
- [ ] 旧版客户端（烘焙 feed URL + `TOOLMAN_UPDATE_CHANNEL=staging`）About → 检查更新可见新版本
- [ ] 下载 → 安装流程成功（macOS 需签名/notarization 才能在生产环境无 Gatekeeper 警告）

## manifest.json Schema

```json
{
  "version": "0.2.0",
  "url": "https://releases.toolman.app/staging/darwin/arm64/Toolman-0.2.0-arm64.dmg",
  "sha256": "<64 hex chars>",
  "notes": "每行一条更新说明",
  "minVersion": "0.1.0"
}
```

由 `scripts/generate-update-manifest.mjs` 生成，schema 定义见 `packages/shared/src/app-update.ts`。
