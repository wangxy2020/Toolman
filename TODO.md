# Toolman 待办任务清单

> 扫描日期：2026-07-17（复扫）  
> 范围：`apps/desktop/src`、`packages/*/src`  
> 结论：
>
> - **无** `// TODO` / `FIXME` / `HACK` 行内注释  
> - **无**大段注释掉的实现代码（`//` 连续禁用块、`/* */` 禁用实现、`{/* */}` 禁用 JSX、CSS 整块禁用规则）  
> - **无**临时/scratch/wip 测试文件，**无** `describe.only` / `it.skip` 等挂起用例  
> - **无** `src` 内计划/说明类 `.md`  
> - 下列条目仅来自产品占位（`available: false`、`即将推出`、unsupported 适配器等），**不是**代码内 TODO

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

## 项目管理

| 任务 | 位置 | 说明 |
|------|------|------|
| 进度分析（关键路径 / 挣值等） | `ProjectScheduleGanttPanel.tsx` | 菜单目前 `alert` 即将推出 |
| 部分领域设置页 | `ProjectManagementSettingsPanel.tsx` | 占位文案 |
| 数据库面板 | `ProjectManagerPage` / toolbar | 入口保留，内容为 reserved 占位 |

## 基础设施（低优先级）

| 任务 | 位置 | 说明 |
|------|------|------|
| Auth build region 缓存 | `auth-build-profile.service.ts` | 当前直读环境变量；测试 reset 为空操作 |

## 说明

- `@deprecated` 迁移桩（KB legacy 名、Gantt prefs、channel 迁移、ICE `stunServers` 等）仍有运行时用途，**不删除**。  
- 资讯中的「推荐文章」接口属于资讯能力，与已删除的社区「推荐」整页无关。  
- 源码内无行内 TODO 可迁移；本文件为唯一任务汇总入口。
