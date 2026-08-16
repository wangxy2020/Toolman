# 多端同步去中心化改造计划（Device Sync → P2P）

> 状态：**实施中**（Phase 0–5 已合入主干：配对 + 个人投递盒 + WebRTC 信令/应答环 + 网页软提示 + device_sync 默认关闭；NAT/TURN 与 DataChannel 互通仍需真机验收）  
> 目标：个人多端同步改为**点到点**优先；群组保持多点 P2P；社区保持多点联邦。  
> 约束：当前无云主机时，**不得**把网页同步绑死在官方 `hub.toolman.*` 明文中转上。

---

## 1. 产品原则（与现有愿景对齐）

| 场景 | 拓扑 | 目标形态 |
|------|------|----------|
| 多端同步（桌面 ↔ 手机 / 网页） | **点到点** | 直连 P2P；离线用加密投递；Hub 仅作可选辅助 |
| 群组通讯 | **多点网状** | 继续现有 WebRTC mesh + mailbox（不改产品语义） |
| 社区内容 | **多点联邦** | 本地 / 联邦优先；官方超级节点可选，非必选 |

**同步数据是点到点的** → 优先复用群组已验证的 WebRTC / mailbox 能力，而不是再建一套「必须云服务器」的明文 changelog 中转。

---

## 2. 现状与问题

### 2.1 今天实际有两套互不打通的平面

1. **个人同步（HTTP）**  
   - 局域网：桌面 Sync Hub `:17890` + 配对令牌（正文 / 知识库文件可用）  
   - 跨网：Community Hub `device_sync`（同账号 identity 桶；知识库多为元数据）  
   - 托管网页：只能走同源代理 → 官方 Hub；**无云 Hub 则失败**

2. **群组 P2P**  
   - 邀请 / SDP 信令、WebRTC DataChannel、加密 mailbox、TURN  
   - 按 `workspaceId` 协作，**不是**「同一账号另一台设备」的个人同步

### 2.2 核心矛盾

- 网页跨网同步被实现成「依赖官方 Hub」，与「只有域名、无云主机」冲突。  
- 群组已证明跨设备通讯可行，个人同步未复用该路径。  
- `device_sync` 明文落库 + 仅靠 `X-Community-User-Id` 时存在身份可伪造风险（生产需收紧）。

---

## 3. 目标架构

```
┌─────────────┐         直连 WebRTC（优先）          ┌─────────────┐
│ 桌面 Sync   │◄──────────────────────────────────►│ 手机 / 网页 │
│  (权威端)   │     失败 / 离线 → 加密个人投递盒      │             │
└──────┬──────┘     （可选：社区/自建 Hub 只存密文）   └─────────────┘
       │
       ├─ 局域网仍保留 Sync Hub HTTP（配对令牌）— 知识库大文件 / Agent Host
       │
       └─ 群组平面不变：invite + mesh + workspace mailbox
```

### 3.1 传输优先级（个人同步）

1. **同局域网 HTTP Sync Hub**（已有，保留）— 全量含知识库正文  
2. **点到点 WebRTC**（新建）— 双方在线时传 `SyncChange` + 小文件  
3. **加密个人投递盒（Personal Mailbox）**（新建，复用群组 mailbox 协议）— 离线 / NAT 失败时  
4. **明文 `device_sync`**（现有）— **降级为过渡 / 可选**；无官方 Hub 时可关闭且不影响 1–3

### 3.2 数据范围（首期）

| 数据 | 点到点 / 投递盒 | 仍建议局域网 HTTP |
|------|-----------------|-------------------|
| 笔记 | ✅ | ✅ |
| 课堂课程 / 记录 | ✅ | ✅ |
| 知识库目录元数据 | ✅ | ✅ |
| 知识库正文 / 向量 | 二期 P2P 文件通道 | ✅ 首期仅 LAN |
| 群组聊天 / 资源 | 不走个人同步（继续群组平面） | — |

---

## 4. 分阶段实施

### Phase 0 — 澄清与止血（0.5–1 天）

- 产品文案：托管网页「无法同步」说明改为「跨网个人同步需对端在线或加密投递；当前未部署官方 Hub 时请用真机局域网」。  
- 诊断页区分：`lan-hub` / `webrtc` / `personal-mailbox` / `device_sync(optional)`。  
- 文档：本计划入库；README Beta 限制补充「网页跨网个人同步改造中」。

**验收：** 用户不再被误导去「必须上云」才能用真机同步。

---

### Phase 1 — 身份与设备配对（个人点到点的前提）

**目标：** 同一账号下识别「我的其他设备」，不依赖群组邀请码。

- 统一身份：继续用 `resolveDeviceSyncIdentityId`（`ag-…` / `fb-…`）。  
- 新增 **Device Pairing**：  
  - 桌面显示短码 / QR（绑定当前 Authing 身份 + 设备公钥）  
  - 手机 / 网页扫码或粘贴短码完成配对  
  - 派生 **personal mailbox grant / 会话密钥**（类比群组 mailbox session，但不绑 `workspaceId`）  
- 局域网已有配对令牌可保留为「信任本机 Hub」；与账号设备配对并存。

**主要落点（预期）：**

- `packages/shared/src/sync/` — 设备配对消息类型  
- `apps/desktop/.../mobile-sync*` + 设置 UI  
- `apps/mobile/.../UserSettings`「令牌同步」扩展为「设备配对 + 同步」

**验收：** 同账号桌面↔手机完成一次配对后，本地存有对端 deviceId + grant，无需群组 invite。

---

### Phase 2 — 加密个人投递盒（可无云主机也能跨网「异步」）

**目标：** 复用现有 mailbox put/pull，载荷改为密封的 `SyncChange[]`。

- 协议：在 `packages/shared/src/p2p/mailbox.ts` 扩展 plaintext kind，例如 `device.sync.changes`。  
- 存储后端**可插拔**：  
  1. **桌面 Sync Hub 已有 mailbox HTTP**（双方能碰到局域网时）  
  2. **社区 Hub mailbox API**（若用户日后自建 / 有官方节点 — 只存密文）  
  3. **一期最小可用：仅当两端曾建立过 WebRTC / 或通过临时信令交换后，用「对端在线拉取」**；完全零基础设施时，跨网异步投递仍需要「至少一个可达的密文中继」——见 §5。  
- 桌面：changelog 追加时，除 LAN Hub 外，向已配对设备投递密封包。  
- 手机 / 网页：轮询个人投递盒（间隔可与现网 15s mailbox 类似），解密后走现有 `mobileSync-pull` 合并逻辑（LWW）。

**验收：** 模拟「桌面先写笔记 → 手机后上线」能合并；抓包可见密文而非明文笔记。

---

### Phase 3 — 在线 WebRTC 直连（真·点到点）

**目标：** 双方在线时优先 DataChannel 传同步增量。

- 复用：`apps/mobile/src/p2p/joinWebRtc.ts`、桌面 answer、ICE/TURN 配置。  
- 信令：  
  - **优先** Sync Hub `/p2p/join`（局域网）  
  - **跨网** 用个人投递盒投递 SDP offer/answer（避免强依赖固定官方 Hub）  
- 通道：复用或新增轻量 `device-sync` DataChannel；消息格式 = 现有 sync changelog 条目。  
- 失败回退：投递盒 →（可选）`device_sync`。

**验收：** 同 NAT / 有 TURN 时，桌面↔手机可直连同步笔记；诊断显示 `transport=webrtc`。

---

### Phase 4 — 网页端接入

**目标：** `www.toolman.work` 在**无官方 Hub**时仍可能同步（对端桌面在线 + 可打洞，或用户自备密文中继）。

- 浏览器 WebRTC（已有群组能力）接入个人配对与 device-sync channel。  
- **禁止**再把「立即同步」唯一路径写成必须 `hub.toolman.app`。  
- 托管页 HTTPS 限制保留：不探测局域网 HTTP；网页跨网只走 WebRTC / 投递盒。  
- 若完全没有中继：UI 明确「需桌面在线且 NAT 可通，或配置可选中继」。

**验收：** 在桌面在线、TURN 可用的环境下，网页登录同账号可拉到笔记增量；无云 Hub 时不再只报 502。

---

### Phase 5 — 知识库大文件与收尾

- 大文件走 P2P 文件通道（群组已有 files channel 模式）或继续「仅局域网 HTTP export」。  
- 向量索引：默认仍本机 / 局域网；不对网页做全量向量同步。  
- 明文 `device_sync`：默认关闭或标记 deprecated；有自建 Hub 的用户可作兼容桥。  
- 配对令牌：保留给 LAN Hub / Agent Host；与设备配对文案拆分清楚。

---

## 5. 「没有云主机」时的诚实边界

| 能力 | 无云主机是否可行 |
|------|------------------|
| 真机 + 局域网 + 配对令牌 | ✅ 已可用 |
| 桌面↔手机 WebRTC（双方在线，NAT 友好或有公共 TURN） | ✅ 作为主路径推进 |
| 网页↔桌面 WebRTC（同上） | ✅ Phase 4 |
| 双方不同时在线仍可靠投递 | ⚠️ 需要**某个**密文中继（自建 Hub / 好友联邦节点 / 日后可选官方节点）；**不能**靠阿里云「只解析域名」完成 |
| 完全离线、永不中继、永久异步投递 | ❌ 物理上需要存储对方消息的第三方 |

计划策略：**同步主路径去中心化（直连）**；异步投递中继**可选、可自建、可联邦**，官方云不是前提。

公共 TURN：可用项目自带 / 文档推荐的公共 STUN；生产 TURN 仍建议自备，但那是「打洞辅助」，不是业务数据中心。

---

## 6. 与群组、社区的边界（避免混用）

- **不要**把个人笔记写进群组 `workspace` 事件日志。  
- **不要**用群组邀请代替账号设备配对。  
- 社区联邦继续独立演进；个人同步不依赖社区审核流。  
- 群组 mailbox 与个人投递盒：协议可同源，**密钥与 ACL 命名空间分离**。

---

## 7. 风险与缓解

| 风险 | 缓解 |
|------|------|
| LWW 与双通道并发写冲突 | 单通道写优先；统一 `updatedAt` +实体 id；投递盒幂等 seq |
| TURN 不可用导致跨网失败 | UI 降级提示；局域网兜底；可选中继 |
| Header-only `device_sync` 伪造 | 过渡期保留；收紧为 JWT；P2P 路径用设备密钥签名 |
| 范围蔓延 | Phase 1–3 只做笔记+课堂；知识库文件 Phase 5 |
| 与现网 Hub 用户兼容 | `device_sync` 双轨一段时间再默认关闭 |

---

## 8. 建议里程碑（可按 RC 切分）

| 里程碑 | 内容 | 预估 |
|--------|------|------|
| M0 | 文案 / 诊断 / 本计划 | 0.5d |
| M1 | 设备配对 + 密钥 | 3–5d |
| M2 | 个人投递盒（LAN Hub mailbox 后端优先） | 5–8d |
| M3 | WebRTC 在线同步桌面↔手机 | 5–8d |
| M4 | 网页接入 + 去掉对官方 Hub 的硬依赖 | 3–5d |
| M5 | 知识库策略 + deprecated device_sync | 3–5d |

---

## 9. 近期不做什么

- 不为「只有域名」强行宣称网页离线同步已可用。  
- 不在移动端引入完整 libp2p（文档已标明桌面侧；个人同步用 WebRTC 足够）。  
- 不把社区超级节点重新变成同步单点必选。

---

## 10. 下一步 Immediate

1. ~~确认本计划方向（点到点优先、Hub 可选）。~~  
2. ~~开工 Phase 0–5（文案、配对、投递盒、WebRTC 信令环、网页软提示、device_sync 默认关闭）。~~  
3. 真机验收：LAN 配对 → 笔记变更进投递盒；非 LAN 时 WebRTC answer + DataChannel（需 TURN/NAT 友好环境）。  
4. 可选：生产 TURN 与网页↔桌面 DataChannel 互通加固。

---

## 附录：关键代码锚点

- 个人同步：`apps/mobile/src/sync/mobileSync-*.ts`，`apps/desktop/src/main/services/mobile-sync-*.ts`，`community-device-sync.ts`  
- 群组 P2P：`apps/mobile/src/p2p/*`，`apps/desktop/src/main/services/p2p/*`，`docs/p2p/P2P_ARCHITECTURE.md`  
- Mailbox：`packages/shared/src/p2p/mailbox.ts`，Community Hub `api/mailbox.rs`  
- 身份：`packages/shared/src/sync/device-sync-identity.ts`
