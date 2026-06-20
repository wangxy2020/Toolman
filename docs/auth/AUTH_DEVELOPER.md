# Toolman Auth 开发者配置

> 账户体系规范见 [ACCOUNT_AUTH_SPEC.md](./ACCOUNT_AUTH_SPEC.md)

## 快速开始（开发环境）

默认 `TOOLMAN_AUTH_BUILD_REGION=global`，国内与国际登录入口均可使用。

1. 复制环境变量模板并启用开发模式：

```bash
cp .env.example .env.local
```

2. 按需填写 Firebase / 腾讯云 / 微信开放平台凭证（国际登录必须配置 `TOOLMAN_FIREBASE_*`）。

3. 重启桌面端：

```bash
pnpm --filter @toolman/desktop dev
```

`.env.local` 会在 Main 进程启动时自动加载（无需手动 export）。

## 环境变量

### 构建分流

| 变量 | 说明 |
|------|------|
| `TOOLMAN_AUTH_BUILD_REGION` | `global`（默认）\| `cn` \| `intl` |
| `TOOLMAN_BUILD_REGION` | 兼容别名 |

### Firebase（国际）

| 变量 | 说明 |
|------|------|
| `TOOLMAN_FIREBASE_API_KEY` | Web API Key |
| `TOOLMAN_FIREBASE_AUTH_DOMAIN` | Auth 域名（如 `your-project.firebaseapp.com`） |
| `TOOLMAN_FIREBASE_PROJECT_ID` | 项目 ID |
| `TOOLMAN_FIREBASE_APP_ID` | 可选，Firebase 控制台 Web 应用 App ID |

**Firebase 控制台必做（否则 Google 登录会报 `configuration-not-found`）：**

1. 打开 [Firebase Console](https://console.firebase.google.com/) → 你的项目
2. **Build → Authentication → Get started**（首次需点「开始使用」启用 Authentication）
3. **Sign-in method → Google → Enable**（启用 Google 登录）
4. **Settings → Authorized domains** 中确认包含 `localhost`

桌面端 Electron 使用 **redirect 登录**（非浏览器弹窗），授权完成后会自动回到应用。

### 腾讯云短信（国内）

| 变量 | 说明 |
|------|------|
| `TOOLMAN_TENCENT_SECRET_ID` | SecretId |
| `TOOLMAN_TENCENT_SECRET_KEY` | SecretKey |
| `TOOLMAN_TENCENT_SMS_SDK_APP_ID` | SdkAppId |
| `TOOLMAN_TENCENT_SMS_SIGN_NAME` | 签名 |
| `TOOLMAN_TENCENT_SMS_TEMPLATE_ID` | 模板 ID |
| `TOOLMAN_TENCENT_SMS_DEV_MODE=1` | 开发模式，固定验证码 `123456` |

### 微信开放平台（国内）

| 变量 | 说明 |
|------|------|
| `TOOLMAN_WECHAT_OPEN_APP_ID` | AppID |
| `TOOLMAN_WECHAT_OPEN_APP_SECRET` | AppSecret |
| `TOOLMAN_WECHAT_DEV_MODE=1` | 开发模式，跳过 OAuth |

## 安全要点

- **Token 存储**：Main 进程通过 Electron `safeStorage` 加密，Renderer 不持久化 refresh token。
- **注销二次验证**：距离上次登录超过 15 分钟时，需通过 `AuthVerifyDeleteReauth` 获取一次性 `reauthToken`。
- **日志脱敏**：开发模式短信日志使用 `formatAuthDevSmsLog`，不输出完整手机号与验证码。
- **Hub JWT**：本地 Hub 启动时注入 `COMMUNITY_HUB_JWT_SECRET`；访客 JWT 禁止写操作。

## 测试

```bash
pnpm --filter @toolman/shared test
pnpm --filter @toolman/desktop test
pnpm --filter @toolman/desktop typecheck
```

核心 auth 测试覆盖：session 视图、feature gate、build profile、reauth token、Hub JWT 签发。

## 用户帮助（注册流程）

1. 点击菜单栏头像 → **登录** 或 **注册**
2. 国内：手机号验证码或微信授权；国际：邮箱 / Google / Apple
3. 注册后可使用群组、社区互动；访客仅可浏览公开社区内容
4. 注销：账户弹窗 → **注销账户** → 二次确认；超时需再次验证身份
