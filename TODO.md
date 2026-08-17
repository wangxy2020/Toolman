# Toolman 待办任务清单

> 扫描日期：2026-08-17  
> 范围：`apps/desktop/src`、`apps/mobile/src`、`packages/*/src`  
> 结论：源码内已无 `// TODO` / `FIXME` / `HACK`，也无大段注释掉的实现。下列条目来自产品占位（`available: false`、`disabled`、reserved 面板等），不是行内 TODO。  
> 本轮 `pnpm typecheck`（Husky pre-commit 同款）全部通过；超过 300 行文件仅做清单，未批量拆分（避免破坏现网功能）。

## 导航与模块

| 任务 | 位置 | 说明 |
|------|------|------|
| 自动化模块（工作流编辑器） | `nav-modules.ts`（`workflow`, `available: false`） | 顶栏占位，尚无独立页面 |
| 代码工具模块 | `nav-modules.ts`（`code-tools`） | `available: false`，无 `view` |
| 顶栏导航布局 | `display-settings-components.tsx` | 「顶部导航」`disabled: true`，仅侧边栏 |

## IM 渠道

| 任务 | 位置 | 说明 |
|------|------|------|
| QQ 运行时适配器 | `channels/unsupported.adapter.ts` | 可保存配置，运行时 unsupported |
| Slack 运行时适配器 | 同上 | 同上 |

## 社区

| 任务 | 位置 | 说明 |
|------|------|------|
| 侧栏「添加 / 探索」 | 桌面 `CommunitySidebar.tsx`、`ModuleSidebar.tsx`；移动 `CommunityPanes.tsx` | 按钮 `disabled`，文案「即将推出」 |
| 管理台「立即扫描」 | 移动 `CommunityPanes.tsx` `comingSoon('立即扫描')` | 提示改用桌面端完整发布流程 |

## 项目管理

| 任务 | 位置 | 说明 |
|------|------|------|
| 进度「链接」工具 | `ProjectGanttMenuBar.tsx`（`key: 'link'`） | 菜单项常驻 `disabled: true`，点击无操作 |
| 进度分析（关键路径 / 挣值等） | `useProjectScheduleGanttPanel.ts` | 菜单目前 `alert` 即将推出 |
| 部分领域设置页 | `ProjectManagementSettingsPanel.tsx` | 非计划领域显示占位文案 |
| 项目信息领域 / 统计 Tab | `ProjectInfoDialogDomainTab.tsx`、`ProjectInfoDialogStatisticsTab.tsx` | 占位文案 |
| 日历面板 | `ProjectScheduleCalendarPanel.tsx` | reserved，待重新设计 |
| 数据库面板 | `ProjectManagerPage.tsx` | 入口保留，内容为 reserved 占位 |

## 知识库

| 任务 | 位置 | 说明 |
|------|------|------|
| 「本地文件」侧栏分区 | `knowledge-sidebar-types.ts` | 类型与路由仍支持 `local-files`，未列入可见侧栏 |

## 账户

| 任务 | 位置 | 说明 |
|------|------|------|
| 桌面用户中心绑定微信入口 | `UserCenterAccountPanelMainViews.tsx` | 菜单项 `disabled: true` |
| 移动端微信授权 | `UserSettingsPanel.tsx` | 提示改用桌面端绑定 |

## 说明

- `@deprecated` 迁移桩（KB legacy 名、Gantt prefs、channel 一次性迁移、task-runtime legacy adapter、`sync_events` 表等）仍有运行时或 schema 兼容用途，不删除。
- 源码内无行内 TODO；本文件为唯一任务汇总入口。
