# Toolman 桌面端打包与 GitHub 发布

## 产物说明

| 平台 | 格式 | 文件名示例 | 用途 |
|------|------|-----------|------|
| macOS | **DMG** | `Toolman-0.2.0-rc.1-arm64.dmg` | 拖拽安装 |
| macOS | **ZIP**（OTA） | `Toolman-0.2.0-rc.1-arm64.zip` | `electron-updater` 自动更新（随 CI 上传 CDN，GitHub Release 可选） |
| Windows | **Portable（免安装）** | `Toolman-0.2.0-rc.1-x64-Portable.exe` | 双击即用，无需安装 |
| Windows | **NSIS 安装包** | `Toolman-0.2.0-rc.1-x64-Setup.exe` | 传统安装 + OTA 自动更新 |

配置见 `apps/desktop/electron-builder.yml`。

---

## 本地打包

### macOS（生成 DMG）

在 Mac 上执行：

```bash
# 仅打包，不上传 CDN
TOOLMAN_UPDATE_CHANNEL=stable \
TOOLMAN_RELEASE_NOTES="本地测试构建" \
bash scripts/build-desktop-release.sh
```

产物目录：`apps/desktop/dist/`

```text
Toolman-{version}-arm64.dmg          # 或 x64（Intel Mac 本机构建）
latest-mac.yml                       # electron-updater 元数据
stable-manifest.json                 # About 页检查更新用
```

### Windows（生成免安装 + 安装包）

**必须在 Windows 环境**（或 GitHub Actions `windows-latest`）构建：

```bash
bash scripts/build-desktop-release.sh
```

产物：

```text
Toolman-{version}-x64-Portable.exe   # 免安装
Toolman-{version}-x64-Setup.exe      # 安装包
latest.yml
stable-manifest.json
```

> 在 macOS 上无法可靠交叉编译 Windows NSIS/Portable，请使用 CI 或 Windows 机器。

### 快捷命令

```bash
pnpm release:desktop
```

---

## 发布到 GitHub Releases

### 方式一：打 Tag 自动发布（推荐）

1. 确认版本号：`apps/desktop/package.json` → `version`
2. 在 GitHub **Settings → Secrets → Actions** 配置 **`TOOLMAN_RELEASE_ENV`**（多行文本，内容与本地 `.env.local` 中认证/P2P 相关变量一致，见 [PRODUCTION_CONFIG.md](./PRODUCTION_CONFIG.md)）
3. 提交并打 tag：

```bash
git add apps/desktop/package.json
git commit -m "chore: bump desktop version to 0.2.0"
git tag v0.2.0
git push origin main
git push origin v0.2.0
```

3. GitHub Actions `Release Desktop` 工作流会：
   - macOS 构建 **DMG**
   - Windows 构建 **Portable + Setup**
   - 自动创建 [GitHub Release](https://docs.github.com/en/repositories/releasing-projects-on-github) 并上传全部产物

Tag 含 `-rc` / `-beta` 时标记为 **Pre-release**。

### 方式二：手动触发 Workflow

1. GitHub → **Actions** → **Release Desktop** → **Run workflow**
2. 选择 channel（`staging` / `stable`）
3. 构建完成后在 **Artifacts** 下载：
   - `desktop-macos-*`
   - `desktop-windows-*`

如需同时发布到 CDN，勾选 **Upload to CDN** 并配置 Secrets（见 [OTA_RELEASE.md](./OTA_RELEASE.md)）。

### 方式三：本地 + `gh` 手动上传

```bash
# 构建后
gh release create v0.2.0 \
  apps/desktop/dist/Toolman-*-arm64.dmg \
  apps/desktop/dist/Toolman-*-Portable.exe \
  apps/desktop/dist/Toolman-*-Setup.exe \
  --title "Toolman v0.2.0" \
  --notes "Release notes here"
```

---

## 发布到 CDN（OTA 自动更新）

与 GitHub Release 独立；用于客户端「检查更新」：

```bash
TOOLMAN_UPDATE_CHANNEL=stable \
TOOLMAN_RELEASE_PUBLISH=1 \
bash scripts/build-desktop-release.sh
```

详见 [OTA_RELEASE.md](./OTA_RELEASE.md)。

---

## 发布前检查

见 [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md)：

- [ ] 版本号已 bump
- [ ] `pnpm smoke` 通过
- [ ] macOS 代码签名 / 公证（生产环境）
- [ ] Windows Authenticode 签名（生产环境）
- [ ] `TOOLMAN_COMMUNITY_HUB_JWT_SECRET` 已配置（Hub 生产）

---

## 常见问题

**Q: Gatekeeper 提示「无法验证开发者」或「已损坏，无法打开」？**  
A: 正式发行需 Apple 开发者账号签名 + 公证。当前 CI 未签名包会在 macOS 上触发 Gatekeeper；若右键打开仍失败，多半是 `.app` 只有残缺签名。在终端执行（路径按实际安装位置修改）：

```bash
xattr -cr /Applications/Toolman.app
codesign --force --deep --sign - /Applications/Toolman.app
open /Applications/Toolman.app
```

若仍不行，删除旧副本后重新从 DMG 安装，或重启后再试（macOS 可能缓存无效签名）。

**Q: Windows 免安装版数据存在哪？**  
A: `%APPDATA%\Toolman`（与安装版相同 userData 路径）。

**Q: 只想要免安装、不要 Setup？**  
在 `electron-builder.yml` 的 `win.target` 中移除 `nsis` 即可（但 OTA 更新将不可用）。
