# RC1 内部 Dogfood 手册

> **阶段**：Beta → RC → GA 之 **RC1**  
> **周期**：≥ 1 周（建议 2026-06-24 起）  
> **受众**：Toolman 核心团队（开发 / 产品 / 测试）  
> **关联**：[RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md) · [OTA_RELEASE.md](./OTA_RELEASE.md) · [PRODUCTION_CONFIG.md](./PRODUCTION_CONFIG.md)

## 1. RC1 目标

在 **staging 配置** 下，用接近生产的 Release 包完成内部日常 dogfood，验证：

- 登录、对话、知识库、社区、P2P 群组核心路径可稳定使用
- libp2p 常开 + 异常 restart、远程 Hub、OTA staging 通道无阻断性缺陷
- 收集 P0/P1 缺陷，**RC1 结束前不得新增 P0**

RC1 **不做**：外部分发、README 去 Beta、stable CDN 切换（留 GA）。

## 2. 启动前门禁（Preflight）

维护者在打 RC1 包前执行：

```bash
pnpm rc1:preflight
```

自动化覆盖：`pnpm smoke`（lint / typecheck / unit / P2P integration / community-hub tests）。

**手动门禁**（见 [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md)）：

| 项 | 说明 |
|----|------|
| macOS 安装包 | 至少 arm64 可安装；签名/notarization 若未完成，Gatekeeper 警告需记录在案 |
| Hub | `TOOLMAN_COMMUNITY_HUB_URL` → staging / production Hub，非 `127.0.0.1` |
| TURN | staging WAN 凭据已注入（跨 NAT 群组测试） |
| OTA | staging manifest 可访问（或 RC1 仅内部分发 dmg，OTA 后补） |
| 干净 profile | 用新 `--user-data-dir` 或删除旧 profile 测首次启动 |

## 3. 构建 RC1 包

版本：**0.2.0-rc.1**（`apps/desktop/package.json`）

```bash
# 本地 staging Release 包（不上传 CDN）
pnpm rc1:build

# 产物
# apps/desktop/dist/Toolman-0.2.0-rc.1-{arch}.dmg
# apps/desktop/dist/staging-manifest.json
# apps/desktop/dist/latest-mac.yml
```

上传到 CDN（凭据就绪后）：

```bash
TOOLMAN_UPDATE_CHANNEL=staging \
TOOLMAN_RELEASE_PUBLISH=1 \
# + TOOLMAN_UPDATE_S3_* / AWS_* 见 OTA_RELEASE.md
pnpm rc1:build
pnpm release:desktop:publish
pnpm release:verify-feed https://releases.toolman.app staging darwin arm64
```

**RC1 客户端默认**（Release 构建烘焙）：

- `TOOLMAN_UPDATE_FEED_URL` = `https://releases.toolman.app`
- `TOOLMAN_UPDATE_CHANNEL` = `staging`
- Hub remote 模式（Release 默认 `https://hub.toolman.app`）

## 4. 分发与安装

1. 内网 / 飞书分发 `Toolman-0.2.0-rc.1-*.dmg`（或 staging OTA 安装旧版后检查更新）
2. 要求参与者使用 **独立 userData**（勿与日常 dev profile 混用）：

```bash
/Applications/Toolman.app/Contents/MacOS/Toolman --user-data-dir="$HOME/Library/Application Support/Toolman-RC1"
```

3. 首次启动确认：**设置 → 系统诊断** Hub URL / libp2p 运行中 / 更新通道 `staging`

## 5. 每日 Dogfood 清单（每人 ≥3 次/周）

复制下表到团队文档，按日勾选。

### 5.1 核心路径

| 日期 | 登录 | 对话流式 | 知识库 FTS | 社区浏览 | 群组 LAN | 备注 |
|------|------|----------|------------|----------|----------|------|
| | ☐ | ☐ | ☐ | ☐ | ☐ | |
| | ☐ | ☐ | ☐ | ☐ | ☐ | |

### 5.2 深度路径（周内至少一次）

- [x] **P2P 双实例（单机）**：`dev:p2p:a` + `dev:p2p:b` · TURN 诊断就绪 · 建群/文件/群聊通过
- [ ] **P2P 双实例签字**：`./scripts/p2p-dual-node-e2e.sh` 清单全部 `[x]` 并归档
- [x] **TURN / WAN 配置（单机预检）**：OpenRelay · [RC1_WAN_SIGNOFF.md §单机预检](./RC1_WAN_SIGNOFF.md)
- [ ] **WAN 群组（跨 NAT）**：两台跨 NAT 机器 + TURN · 正式签字
- [ ] **OTA**：About → 检查更新（staging manifest 可用时）
- [ ] **崩溃上报**：系统诊断开启 opt-in → 触发测试崩溃 → 确认上传或本地留存符合预期
- [ ] **离线 Hub**：断网后社区只读缓存 + 恢复后同步

### 5.3 非功能观察

- [ ] 冷启动 < 15s（Release 包，非 dev）
- [ ] 空载内存 < 500MB（活动监视器）
- [ ] libp2p 异常退出后 1 分钟内自动 restart（诊断事件可见）

## 6. 缺陷记录

完整模板见 **[RC1_DEFECT_TRACKER.md](./RC1_DEFECT_TRACKER.md)**（汇总看板、主表列头、单条填报模板、状态流转、模块枚举）。

主表摘要（详细字段见模板）：

| ID | 严重度 | 模块 | 复现步骤 | 负责人 | 状态 |
|----|--------|------|----------|--------|------|
| RC1-001 | P0/P1/P2 | | | | open |

**严重度**：

- **P0**：崩溃 / 数据丢失 / 无法登录 / P2P 完全不可用
- **P1**：核心路径阻断，有 workaround
- **P2**：体验问题、非阻断

## 7. RC1 退出标准（→ RC2）

全部满足方可进入 RC2：

1. Dogfood **≥ 7 日历日**，≥ 3 名参与者有完整核心路径记录
2. **P0 = 0**，未修复 P1 有 documented workaround 或已排期
3. `pnpm rc1:preflight` 在 release 分支绿
4. P2P 双实例 + WAN 手册项至少各 **1 次** 团队签字
5. 维护者确认 staging OTA 或等价分发流程可用

## 8. RC1 期间红线（管理层决策，不可破）

- Hub 仅官方远程 `https://hub.toolman.app`
- 语义搜索 v1.1，GA 仅 FTS
- Yjs 点赞/收藏 HTTP-only
- D5 占位模块零投入

## 9. 命令速查

```bash
pnpm rc1:dogfood-day              # 每日轻量检查 + 手册提醒
pnpm rc1:dogfood-day -- --full    # 含 rc1:preflight
pnpm rc1:preflight              # 启动前自动化门禁
pnpm rc1:build                  # RC1 staging Release 包
pnpm rc1:wan-prep -- --all-dev-profiles   # OpenRelay / staging TURN → network.json
pnpm rc1:publish-staging        # 构建 + 上传 CDN + verify-feed（需凭据）
pnpm release:verify-feed ...    # 验证 staging OTA
./scripts/p2p-dual-node-e2e.sh  # P2P 手册清单
pnpm --filter @toolman/desktop test:e2e   # Playwright GA smoke
```
