# Toolman 待办任务清单

> 由代码库扫描生成（2026-06-28）。`apps/desktop/src` 及 `packages/*/src` 中**未发现** `// TODO` / `FIXME` 行内注释；下列条目来自 `available: false`、占位 UI、`即将推出` 文案及 stub 适配器等**已实现占位、功能未完成**的代码路径。

## 导航与模块

| 任务 | 位置 | 说明 |
|------|------|------|
| 自动化模块（工作流编辑器） | `renderer/features/settings/nav-modules.ts` (`workflow`, `available: false`)、`renderer/features/modules/module-config.ts` | 顶栏「自动化」入口占位；可在 设置 → 显示 → 隐藏图标 中预先启用，但尚无实际页面 |
| 翻译模块 | `nav-modules.ts` (`translate`) | 导航项已定义，不可点击 |
| 助手库模块 | `nav-modules.ts` (`assistant-lib`) | 导航项已定义，不可点击 |
| 代码工具模块 | `nav-modules.ts` (`code-tools`) | 导航项已定义，不可点击 |
| 项目管理模块 | `nav-modules.ts` (`projects`) | 导航项已定义，不可点击 |
| 顶栏导航布局 | `renderer/features/settings/display-settings-components.tsx` | 「顶部导航」选项 `disabled: true`，仅支持侧边栏布局 |

## IM 渠道集成

| 任务 | 位置 | 说明 |
|------|------|------|
| QQ 渠道运行时适配器 | `main/services/channels/unsupported.adapter.ts` | 可保存配置，状态为 `unsupported` |
| Slack 渠道运行时适配器 | 同上 | 可保存配置，状态为 `unsupported` |

## 社区 UI 占位

| 任务 | 位置 | 说明 |
|------|------|------|
| 社区侧栏「添加」按钮 | `CommunitySidebar.tsx`、`ModuleSidebar.tsx` | 按钮 `disabled`，`title` 为「即将推出」 |
| 未知社区 action 面板 | `CommunityPage.tsx` → `CommunityPlaceholderPanel` | 未映射的 `effectiveAction` 显示占位面板 |

## 性能与基础设施（低优先级）

| 任务 | 位置 | 说明 |
|------|------|------|
| Auth build profile 缓存 | `main/services/auth/auth-build-profile.service.ts` | 注释预留 memoization，当前每次直读环境变量 |

## 扫描结论（无需代码内 TODO 注释）

- **大段注释死代码**：`apps/desktop/src`、`packages/*/src` 中未发现 2 行以上的注释掉的实现代码；CSS 中亦无整块注释掉的规则。
- **行内 TODO**：全库 `src` 无 `// TODO` / `FIXME` / `HACK` 注释；无需从源码迁移或删除。
