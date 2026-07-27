# Toolman 待办任务清单

> 扫描日期：2026-07-27  
> 范围：`apps/desktop/src`、`packages/*/src`  
> 结论：
>
> - **无** `// TODO` / `FIXME` / `HACK` 行内注释（无需从源码迁出）  
> - **无**大段注释掉的实现代码（`//` 连续禁用块、`/* */` 禁用实现、`{/* */}` 禁用 JSX）  
> - 本轮已删除确认无引用的废弃 CSS（旧 `.tm-notes-toolbar*`、`.tm-pm-gantt-toolbar*` 等）  
> - 下列条目仅来自产品占位（`available: false`、`disabled: true`、unsupported 适配器等），**不是**代码内 TODO

## 导航与模块

| 任务 | 位置 | 说明 |
|------|------|------|
| 自动化模块（工作流编辑器） | `nav-modules.ts`（`workflow`, `available: false`） | 顶栏占位，尚无实际页面 |
| 助手库模块 | `nav-modules.ts`（`assistant-lib`） | `available: false` |
| 代码工具模块 | `nav-modules.ts`（`code-tools`） | `available: false` |
| 顶栏导航布局 | `display-settings-components.tsx` | 「顶部导航」`disabled: true`，仅侧边栏 |

## IM 渠道

| 任务 | 位置 | 说明 |
|------|------|------|
| QQ 运行时适配器 | `channels/unsupported.adapter.ts` | 可保存配置，运行时 unsupported |
| Slack 运行时适配器 | 同上 | 同上 |

## 社区

| 任务 | 位置 | 说明 |
|------|------|------|
| 侧栏「添加」按钮 | `CommunitySidebar.tsx`、`ModuleSidebar.tsx` | `disabled` +「即将推出」 |
| 未落地的社区子面板 | `CommunityPage.tsx` → `CommunityPlaceholderPanel` | 非 mcp/news/messages/skills/workflow/tasks/knowledge/subscribe/management 时的兜底占位 |

## 项目管理

| 任务 | 位置 | 说明 |
|------|------|------|
| 进度「链接」工具 | `ProjectGanttMenuBar.tsx`（`key: 'link'`） | 菜单项常驻 `disabled: true` |
| 进度分析（关键路径 / 挣值等） | `useProjectScheduleGanttPanel.ts` | 菜单目前 `alert` 即将推出 |
| 部分领域设置页 | `ProjectManagementSettingsPanel.tsx` | 占位文案 |
| 项目信息领域 / 统计 Tab | `ProjectInfoDialogDomainTab.tsx` 等 | 占位文案 |
| 日历面板 | `ProjectScheduleCalendarPanel.tsx` | reserved 占位 |
| 数据库面板 | `ProjectManagerPage.tsx` | 入口保留，内容为 reserved 占位 |
| 其它 reserved 面板 | `ProjectManagerPage.tsx` | 按 `panelView` 显示 reserved 文案 |

## 说明

- `@deprecated` 迁移桩（KB legacy 名、Gantt prefs、channel 一次性迁移、task-runtime legacy adapter 等）仍有运行时用途，**不删除**。  
- 源码内无行内 TODO 可迁移；本文件为唯一任务汇总入口。
