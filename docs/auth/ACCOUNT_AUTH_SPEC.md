# Toolman 账户与权限规范

> **版本**: V1 设计稿  
> **状态**: 已确认，可开始编码  
> **关联**: [Community Hub 架构](../community/COMMUNITY_ARCHITECTURE.md)

---

## 1. 已确认产品决策

| # | 决策项 | 结论 |
|---|--------|------|
| 1 | 未注册用户社区能力 | **可只读浏览**公开社区内容；写操作与群组需注册 |
| 2 | 国内登录方式 | **微信与手机号合并为同一账户**（账户绑定 / 统一 `identity_id`） |
| 3 | 海外登录优先级 | **Email > Google > Apple** |
| 4 | Hub 部署 | 本机 Sidecar + **未来云端 Hub**，**共用一套 Auth** |
| 5 | 注销 | **远端销号**（Firebase / 腾讯云侧删除或标记注销，不仅清本地 Session） |
| 6 | 版本策略 | **一套账户体系，两套权限 SKU**（见 §3） |

---

## 2. 账户体系总览

### 2.1 三层身份

```
Auth Subject（Firebase UID / 腾讯云 openid+phone）
        ↓ 1:N 绑定（微信+手机号可合并）
Toolman Identity（稳定 UUID，本地 identities + 跨设备）
        ↓ 1:1 或 1:N（Hub 用户记录）
Community User（community_users，role + 权限字段）
        ↓ 可选
P2P Device Identity（设备密钥，注册后才可入群）
```

- **Auth Subject**：外部 IdP 主键，由 Auth 服务签发 JWT / ID Token。
- **Toolman Identity**：桌面端持久 UUID；首次注册时创建，注销时按策略处理（见 §7）。
- **Community User**：Hub 侧用户档案；本地 Hub 与云端 Hub 使用同一 `identity_id` + Token 校验。
- **P2P Device**：本机密码学设备身份；**未注册用户**可本地存在，但**不可创建/加入群组**。

### 2.2 统一 Auth（本机 + 云端 Hub）

```
Desktop (Main AuthService)
    │  Bearer JWT / ID Token
    ├─► Local Community Hub  (127.0.0.1)
    └─► Cloud Community Hub  (未来，同一 Token 校验端点或 JWKS)
```

- Token 由 **统一 Auth 网关** 或各 IdP 签发，Hub 只认 **issuer + audience + subject**。
- Desktop 配置 `COMMUNITY_HUB_URL`（本地默认 / 云端可切换），**鉴权头格式不变**。
- `X-Community-User-Id` 仅作兼容或调试；正式路径为 `Authorization: Bearer <token>`，Hub 解析出 `identity_id`。

---

## 3. 一套账户 + 两套权限 SKU

### 3.1 SKU 定义

| SKU | 内部标识 | 说明 |
|-----|----------|------|
| **社区版** | `community` | 默认 SKU；注册后可用社区全功能 + 群组 |
| **专业版**（名称待定） | `pro` | 同一账户登录；额外模块/配额/企业能力 |

- 账户只有 **一套**（一个 `identity_id`、一套登录凭证）。
- SKU 体现在 **`subscription_sku` + `entitlements[]`**，不由「再注册一个号」区分。
- 未注册 = **访客**（无 SKU，仅社区只读 + 单机模块）。

### 3.2 权限矩阵

| 能力 | 访客（未注册） | 社区版（已注册） | 专业版（已注册 + SKU） |
|------|----------------|------------------|------------------------|
| 智能体 / 知识库 / 笔记 / 设置 | ✅ | ✅ | ✅ |
| 社区浏览（公开资源、资讯） | ✅ 只读 | ✅ | ✅ |
| 社区互动（评论、收藏、安装、发布、任务） | ❌ | ✅ | ✅ |
| 群组（创建/加入/同步/群聊） | ❌ | ✅ | ✅ |
| 专业版独占能力（待定） | ❌ | ❌ | ✅ |

Hub 侧：`guest` 角色对应访客只读；注册用户默认 `role=user`；专业版通过 `entitlements` 或 `role=enterprise` 扩展。

---

## 4. 区域与登录方式

### 4.1 区域

| 区域 | 标识 | 主 IdP | 辅助方式 |
|------|------|--------|----------|
| 国际 | `intl` | Firebase Auth | Email → Google → Apple |
| 国内 | `cn` | 腾讯云 | 手机号验证码、微信 OAuth |

- 首次注册时可按 `app.locale` 推荐区域，**允许用户手动切换**。
- 同一 `identity_id` 可在后续绑定第二种区域登录方式（账户关联），合并规则见 §5。

### 4.2 海外登录优先级（产品入口顺序）

1. **Email + Password**（注册 / 登录 / 找回密码）
2. **Google** OAuth
3. **Apple** Sign In

UI 上按此顺序排列；Implementation 可并行，但默认 Tab / 主按钮遵循该顺序。

### 4.3 国内登录

- **手机号 + 短信验证码**：注册即登录；手机号作为账户主标识之一。
- **微信授权登录**：OAuth 获取 `openid`（及 `unionid` 如有）。
- **合并规则**：见 §5。

---

## 5. 账户合并（微信 ↔ 手机号）

### 5.1 原则

**一个自然人 = 一个 `identity_id`**。微信与手机号是同一账户的多种 **Auth Binding**，不是两个用户。

### 5.2 场景

| 场景 | 行为 |
|------|------|
| 先手机后微信 | 已登录状态下「绑定微信」→ 同一 `identity_id` 增加 `wechat` binding |
| 先微信后手机 | 微信登录后「绑定手机」→ 验证短信后合并 |
| 微信登录命中已存在手机号账户 | 提示「是否合并到已有账户」→ 验证手机后合并 binding |
| 冲突（两账户均有数据） | V1：**禁止自动合并**；引导客服或「选择保留账户」流程（Task 后续迭代） |

### 5.3 数据模型（草案）

`auth_bindings` 表（或等价结构）：

| 字段 | 说明 |
|------|------|
| `identity_id` | Toolman 主键 |
| `provider` | `firebase_email` \| `firebase_google` \| `firebase_apple` \| `tencent_phone` \| `tencent_wechat` |
| `subject_id` | IdP 侧唯一 ID |
| `verified_at` | 验证时间 |
| `metadata_json` | 手机号掩码、微信 nickname 等 |

---

## 6. Community Hub 鉴权

### 6.1 请求头

```
Authorization: Bearer <access_token>
X-Toolman-Sku: community | pro          # 可选，或由 Token claims 携带
X-Toolman-Client: desktop | web         # 可选
```

Hub Middleware：

1. 校验 JWT 签名与过期；
2. 解析 `sub` → 查 `identity_id`；
3. 加载 `community_users` + SKU entitlements；
4. 只读 API：允许无 Token 或 guest Token；
5. 写 API：要求 `role != guest` 且对应 permission bit。

### 6.2 访客浏览

- **无需登录**即可：`GET` 公开资源列表、资讯、资源详情（与现架构一致）。
- 前端：未注册进入社区 Tab **不拦截**；点击「评论 / 发布 / 安装 / 任务」时弹出注册引导。
- 后端：写接口统一返回 `403 AUTH_REGISTRATION_REQUIRED`。

### 6.3 本地 Hub 与云端 Hub

- 同一套 Rust 鉴权 middleware；云端增加 rate limit、审计日志。
- Desktop 登录后 Token 对 **当前配置的 Hub 基址** 有效；切换 Hub URL 时重新 exchange（若 issuer 不同）。

---

## 7. 注销（远端销号）

### 7.1 用户可见流程

1. 用户账户弹窗 → **注销账户**（二次确认 + 输入确认文案）。
2. Main 调用 IdP **删号 API**：
   - Firebase：`deleteUser`
   - 腾讯云：对应用户注销接口
3. 调用 Hub **`DELETE /users/me`**（或标记 `status=deleted`）清理社区数据（策略：软删 + 匿名化公开内容）。
4. 清除本地：Session、Token、community session、可选 P2P 群组成员资格提示。
5. 本地 `identity` 回退为 **新访客** 或 **保留本地数据但不关联旧账户**（PRD：**保留本地智能体/知识库/笔记**，与旧 `identity_id` 脱钩）。

### 7.2 与安全

- 注销前必须 re-auth（最近登录或密码/验证码确认）。
- 日志脱敏；Token 立即失效。

---

## 8. 桌面 UI：用户弹窗

入口：菜单栏头像 `UserAccountMenu`（现有组件重构）。

| 区块 | 访客 | 已注册 |
|------|------|--------|
| 状态 | 「访客 · 社区只读」 | 昵称、SKU 标签、登录方式 |
| 操作 | **登录**、**注册** | **资料编辑**、**注销账户** |
| 资料 | 仅本地显示名（可选） | 头像、昵称、简介（同步 Hub） |
| 设备 | 简略 | 完整设备列表 |

注册/登录：

- 国际：Email → Google → Apple
- 国内：手机号 / 微信 Tab

---

## 9. 群组（P2P）门槛

- **访客**：不可创建/加入/同步群组；导航可进入但展示注册引导页。
- **已注册**：现有 P2P 流程；`p2p_device_identity.identity_id` 绑定注册账户的 `identity_id`。

---

## 10. IPC / 类型（草案）

| Channel | 说明 |
|---------|------|
| `AuthGetSession` | 当前 session、SKU、bindings 摘要 |
| `AuthLogin` | `{ region, method, ... }` 发起登录 |
| `AuthLogout` | 仅登出本机 |
| `AuthDeleteAccount` | 远端销号 + 本地清理 |
| `AuthBindProvider` | 绑定微信/手机/Apple 等 |
| `AuthVerifyDeleteReauth` | 注销前二次验证，返回一次性 `reauthToken` |
| `AuthExchangeHubToken` | 换取 Hub 可用 access token（若需要） |

Shared types：`AuthSession`, `AuthProvider`, `RegistrationStatus`, `ProductSku`, `Entitlement`.

---

## 11. 开发任务索引

| 任务 | 状态 |
|------|------|
| Task-001 本文档 | ✅ 已确认 |
| Task-002 数据模型 + IPC 契约 | ✅ 已完成 |
| Task-003 Feature Gate | ✅ 已完成 |
| Task-004 用户弹窗 IA | ✅ 已完成 |
| Task-005 Firebase（Email > Google > Apple） | ✅ 已完成 |
| Task-006 国内手机号 | ✅ 已完成 |
| Task-007 微信 + 账户合并 | ✅ 已完成 |
| Task-008 Hub 统一 JWT 鉴权 | ✅ 已完成 |
| Task-009 群组门槛 + 设备绑定 | ✅ 已完成 |
| Task-010 资料同步 + SKU 展示 | ✅ 已完成 |
| Task-011 区域与构建分流 | ✅ 已完成 |
| Task-012 测试与安全 | ✅ 已完成 |

---

## 12. Firebase 配置（Task-005）

桌面端 Main 与 Renderer 共用以下环境变量（开发时在启动 Electron 前 export，或使用 `.env.local` 由启动脚本注入）：

| 变量 | 说明 |
|------|------|
| `TOOLMAN_FIREBASE_API_KEY` | Firebase Web API Key |
| `TOOLMAN_FIREBASE_AUTH_DOMAIN` | 如 `your-project.firebaseapp.com` |
| `TOOLMAN_FIREBASE_PROJECT_ID` | Firebase Project ID |

也兼容 `FIREBASE_*` 前缀。未配置时国际登录入口会返回 `AUTH_NOT_CONFIGURED`。

OAuth（Google / Apple）在 Renderer 使用 Firebase JS SDK `signInWithPopup`；Main 进程允许 Google / Apple / Firebase 相关域名的弹窗。

---

## 13. 腾讯云短信配置（Task-006）

| 变量 | 说明 |
|------|------|
| `TOOLMAN_TENCENT_SECRET_ID` | 腾讯云 API SecretId |
| `TOOLMAN_TENCENT_SECRET_KEY` | 腾讯云 API SecretKey |
| `TOOLMAN_TENCENT_SMS_SDK_APP_ID` | 短信 SdkAppId |
| `TOOLMAN_TENCENT_SMS_SIGN_NAME` | 短信签名 |
| `TOOLMAN_TENCENT_SMS_TEMPLATE_ID` | 验证码模板 ID（参数：验证码、有效期分钟） |
| `TOOLMAN_TENCENT_SMS_REGION` | 可选，默认 `ap-guangzhou` |
| `TOOLMAN_TENCENT_SMS_DEV_MODE` | 设为 `1` 时跳过真实短信，固定验证码 `123456` |

也兼容 `TENCENT_*` 前缀。国内手机号登录流程：

1. `AuthSendSmsCode` 发送验证码（Renderer「获取验证码」）
2. `AuthLogin` + `tencent_phone` 校验验证码并注册/登录

微信 OAuth 仍待 Task-007。

---

## 14. 微信开放平台配置（Task-007）

| 变量 | 说明 |
|------|------|
| `TOOLMAN_WECHAT_OPEN_APP_ID` | 微信开放平台网站应用 AppID |
| `TOOLMAN_WECHAT_OPEN_APP_SECRET` | AppSecret |
| `TOOLMAN_WECHAT_REDIRECT_URI` | 可选，默认 `http://127.0.0.1:47823/auth/wechat/callback` |
| `TOOLMAN_WECHAT_REDIRECT_PORT` | 可选，默认 `47823` |
| `TOOLMAN_WECHAT_DEV_MODE` | 设为 `1` 时跳过 OAuth，使用开发账户 |

也兼容 `WECHAT_*` 前缀。登录流程：

1. `AuthLogin` + `tencent_wechat` 打开系统浏览器完成 OAuth
2. 若本机已有手机号 binding，返回 `AUTH_MERGE_REQUIRED`，需短信验证后合并
3. 已登录用户可通过 `AuthBindProvider` 或账户弹窗绑定微信/手机号

---

## 16. Hub JWT 鉴权（Task-008）

桌面端 Main 进程在 `userData` 生成并持久化 HS256 共享密钥，启动本地 Hub 时注入 `COMMUNITY_HUB_JWT_SECRET`。

| 组件 | 说明 |
|------|------|
| `hub-jwt-secret.service.ts` | 生成/读取共享密钥 |
| `hub-jwt.service.ts` | 签发 Hub access token（`sub`=identity_id，`registration_status`，`sku`） |
| `auth-hub-token.service.ts` | `AuthExchangeHubToken` 实现，加密存入 `hub_token_ref` |
| `community-hub-auth.service.ts` | Community HTTP 客户端 Bearer 头解析与缓存 |
| Hub `api/jwt.rs` | 校验 `Authorization: Bearer`，兼容 `X-Community-User-Id` |
| `guest_write_block_middleware` | 访客 JWT 禁止 POST/PATCH/DELETE 写操作 |

Claims：`iss=toolman-desktop`，`aud=toolman-community-hub`，TTL 默认 3600s。

---

## 17. 群组门槛与设备绑定（Task-009）

| 层级 | 行为 |
|------|------|
| IPC | `wrapHandlerWithAuthGate` 拦截所有 `p2p:*`（除 `P2pDeviceGetInfo` / `P2pPing`） |
| Main P2P | `assertRegisteredForP2p()` 保护创建/加入/同步入口 |
| Renderer | 访客进入群组/社区模块时 `useRegistrationGate` 拦截需登录操作，不加载 workspace 列表 |
| 设备绑定 | 登录/注销/销号后 `bindP2pDeviceToIdentity` 同步 `p2p_device_identity.identity_id` |

---

## 18. 资料同步与 SKU 展示（Task-010）

| 组件 | 说明 |
|------|------|
| `auth-profile-sync.service.ts` | 登录后推送本地 `displayName` 到 Hub `/users/me` |
| `finalizeRegisteredLogin` | 登录流程末尾触发资料同步 |
| `UserAccountMenu` | 展示 SKU 徽章、登录方式标签、Hub 简介编辑 |
| `useUserAccount.saveBio` | 简介写入 Hub（需 Hub 在线） |

登录成功后自动 exchange Hub JWT 并同步昵称；SKU 在账户弹窗以徽章展示（`community` / `pro`）。

---

## 19. 区域与构建分流（Task-011）

通过环境变量 `TOOLMAN_AUTH_BUILD_REGION`（兼容 `TOOLMAN_BUILD_REGION`）控制发行构建的登录入口：

| 值 | 说明 |
|----|------|
| `global` | 默认（开发/通用包）：国内 + 国际均可切换 |
| `cn` | 国内版：仅手机号 / 微信 |
| `intl` | 国际版：仅 Firebase（邮箱 / Google / Apple） |

| 组件 | 说明 |
|------|------|
| `auth-build-profile.service.ts` | 解析构建配置，`assertAuthLoginAllowed` / `assertAuthBindAllowed` |
| `AuthGetBuildProfile` IPC | Renderer 读取 `AuthBuildProfile` |
| `UserCenterModal` | 锁定构建时隐藏区域切换 Tab |
| `UserAccountMenu` | 国内构建才展示手机号/微信绑定按钮 |
| `loginAuth` / `sendAuthSmsCode` / `bindAuthProvider` | Main 进程强制校验 |

---

## 20. 测试与安全（Task-012）

| 类别 | 内容 |
|------|------|
| 注销 re-auth | 15 分钟内最近登录可直删；否则 `AuthVerifyDeleteReauth` → `reauthToken` |
| Token 清理 | 注销/登出清除 session、Hub token 缓存、P2P 设备绑定 |
| 日志脱敏 | `auth-log-redaction.ts`；开发短信日志不输出完整手机号/验证码 |
| 测试 | shared + desktop 单元测试：security helpers、reauth、session gate、Hub JWT |
| 文档 | [AUTH_DEVELOPER.md](./AUTH_DEVELOPER.md) 开发者配置与用户注册说明 |

安全检查清单：

- [x] Token 仅存 Main `safeStorage` 加密 ref
- [x] 注销需确认文案 + 超时 re-auth
- [x] IPC 写操作经 auth gate 拦截
- [x] Hub 访客 JWT 禁止写 API
- [x] 构建分流限制登录方式

---

## 15. 开放项（编码前可并行确认）

- 专业版 `pro` 具体 entitlements 列表（不影响社区版 MVP）。
- 云端 Hub 首版 URL 与 Token issuer 是否独立域名。
- 注销后社区 UGC 匿名化规则（昵称显示为「已注销用户」等）。

---

**文档确认人**: 产品决策已录入 §1  
**下一步**: 账户体系 V1 编码任务已全部完成；后续可按开放项迭代 pro entitlements 与云端 Hub exchange。
