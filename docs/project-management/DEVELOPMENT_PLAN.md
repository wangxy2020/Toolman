# Toolman 项目管理模块开发计划

> 版本：Phase 0 基线  
> 状态：Phase 5 已完成  
> 约束：**不修改**智能体、知识库、笔记、群组、社区、翻译模块源码，仅通过 IPC / 元数据 / 工作区约定集成。

## 1. 愿景

在 Toolman 桌面端打造 **AI 原生工程项目管理平台**：将 OpenProject 等成熟 PM 产品的计划、任务、成本、资源能力，与 Toolman 已有的智能体、知识库、笔记、P2P 群组深度融合。

### 1.1 UI 结构（已实现壳层）

**左侧分栏**（可自定义显隐/排序）：

| Key | 中文 | 阶段 |
|-----|------|------|
| `all_projects` | 工作台 | P1 |
| `urgent_tasks` | 待办 | P1 |
| `key_projects` | 综合管理 | P3 |
| `progress_management` | 计划管理 | P0 看板 MOCK → P2 甘特 |
| `cost_management` | 成本管理 | P0 EPC 引擎 + 看板 |
| `resource_management` | 资源管理 | P4 |
| `security_management` | 安全质量 | P4 |
| `quality_management` | 测量试验 | P4 |
| `archive_management` | 档案管理 | P4 |
| `customize_menu` | 自定义 | ✅ |

**面板工具栏**（每个分栏下）：

| 视图 | 中文 | 职责 |
|------|------|------|
| `stats` | 统计 | KPI、看板、甘特（远期） |
| `agent` | 智能体 | 域专用助手 + EPC/AI 工作流 |
| `files` | 文件 | 工作区文件树 |
| `database` | 数据库 | 结构化 CRUD 表格 |
| `settings` | 设置 | 域配置、自定义字段 |

代码入口：`apps/desktop/src/renderer/features/project-manager/`、`project-management-epc/`。

## 2. OpenProject 对标（借鉴思路，不移植代码）

OpenProject（[opf/openproject](https://github.com/opf/openproject)）以 **Work Package** 为核心实体，Rails + Angular + PostgreSQL，模块化 Rails Engine。

| OP 模块 | 能力 | Toolman 映射 |
|---------|------|--------------|
| Work Packages | 任务/里程碑/阶段/缺陷、层级、依赖 | `PmWorkItem` |
| Gantt | 时间轴、依赖、多项目时间线 | 计划管理 · stats |
| Boards | Kanban | 待办 · stats |
| Calendar | 日历视图 | 计划管理 · stats |
| Time & Costs | 工时、预算 | 成本/资源管理 |
| Documents | 文档关联工作项 | 档案管理 · files + 知识库 |
| Relations | FS/SS/FF/SF 依赖 | `PmWorkItemRelation`（P2） |
| Baseline | 计划基线对比 | `PmSchedule`（P2） |
| Multi-Project | 跨项目时间线 | 工作台 / 综合管理 |

**Toolman 差异化（AI 原生）**：

- AI 项目规划、WBS 自动生成、自动排期
- AI 成本预测、风险预警
- AI 日/周/月报 → 导出笔记
- EPC 商业引擎（Rust）成本流水线

## 3. 目标架构

```
Renderer project-manager/
  → IPC pm:*
Main services/project-management/
  → @toolman/db (pm_projects, pm_work_items)
  → epc-commercial/（成本 Excel 流水线）
  → agent-generation/system-hints（PM 上下文注入，只读调用）
Packages/shared/project-management/
  → 类型、IPC Zod、修订层 revisions.json
```

数据双轨：

1. **结构化**：SQLite `pm_*` 表（任务、项目、关系）
2. **EPC 文件**：工作区 Excel/CSV + `revisions.json` 修订层

## 4. 分阶段计划

### Phase 0：基础夯实（已完成）

| 任务 | 交付物 |
|------|--------|
| `pm_projects` / `pm_work_items` schema + migration | `@toolman/db` |
| `PmProjectService` / `PmWorkItemService` | main/services/project-management/ |
| `pm:*` IPC + Zod 契约 | `@toolman/shared` |
| 接线 `PropagatePmDataAfterEdit` | ipc-handler-epc |
| 注入 `PM_REVISION_AGENT_INSTRUCTIONS` | system-hints（PM 会话） |
| 数据库面板 MVP | 计划/成本分栏 · database 视图 |
| 演示数据种子 | MOCK 项目 + 工作项（首次打开自动导入） |
| 单元测试 | shared pm-ipc schema |

### Phase 1：工作项核心（已完成）

| 任务 | 交付物 | 状态 |
|------|--------|------|
| `PmWorkItem` 全字段 + 父子层级 | IPC 过滤、层级校验、树形数据库 UI | ✅ |
| 待办看板 / 全部项目统计 | `ProjectKanbanPanel` / `ProjectManagementDashboard` | ✅ |
| 各域 agent 面板框架统一 | 9 个分栏 session + runtime hints | ✅ |
| files 视图：工作区文件树 | `ProjectManagementFilesPanel` | ✅ |

### Phase 2：计划与成本（已完成）

| 任务 | 交付物 | 状态 |
|------|--------|------|
| 甘特图 + 日历 + 基线 | `ProjectScheduleGanttPanel` / `ProjectScheduleCalendarPanel`、relations/baselines schema | ✅ |
| AI WBS / 自动排期 / 成本预测 | plan quick phrases + slash commands | ✅ |
| 成本 database 表格化 | `ProjectCostDatabasePanel` | ✅ |

### Phase 3：执行与协作（已完成）

| 任务 | 交付物 | 状态 |
|------|--------|------|
| 待办看板统计 | `ProjectKanbanPanel` | ✅ |
| 工时填报 | `pm_time_entries` + `ProjectTimeEntryPanel` | ✅ |
| AI 日报/周报/月报 | report quick phrases + `/daily` `/weekly` `/monthly` | ✅ |
| 档案关联知识库 | `pm_document_links` + `ProjectDocumentLinksPanel` | ✅ |

### Phase 4：垂直域（已完成）

| 任务 | 交付物 | 状态 |
|------|--------|------|
| 资源/安全/试验/综合/档案演示数据 | `pm-seed.service` 垂直域种子 | ✅ |
| 垂直域统计面板 | `ProjectVerticalDomainStatsPanel` 等 | ✅ |
| 自定义字段（metadata） | `pm-custom-fields.ts` + 数据库表单 | ✅ |
| 档案统计 + 文档关联 | `ProjectArchiveStatsPanel` | ✅ |

### Phase 5：发布与 P2P（已完成）

| 任务 | 交付物 | 状态 |
|------|--------|------|
| 域级设置面板 | `ProjectManagementSettingsPanel` | ✅ |
| P2P `PmData` 资源类型 + 投影 | `pm-p2p-sync.service` / `p2p-pm-projection` | ✅ |
| 工作项增量同步 | `maybeEmitPmWorkItemP2pEvent` | ✅ |
| 域设置持久化 | `pm-domain-settings.service` | ✅ |

## 5. 目录规划

```
packages/db/src/schema/pm.ts
packages/db/src/repositories/pm-*.repository.ts
packages/shared/src/project-management/pm-types.ts
packages/shared/src/ipc/pm.ts
apps/desktop/src/main/services/project-management/
apps/desktop/src/main/ipc/handlers/ipc-handler-map/ipc-handler-pm.ts
apps/desktop/src/renderer/features/project-manager/views/database/
docs/project-management/   ← 本文档
```

## 6. 集成边界

| 模块 | 集成方式 |
|------|----------|
| 智能体 | 域 metadata + system hints + slash（不改 agent-generation 核心） |
| 知识库 | `PmDocumentLink` + 只读 `knowledge:*` IPC |
| 笔记 | 报告 `notes.createNoteFromMessage`（已有） |
| 群组 | Phase 4+ `p2p` 事件适配器 |
| EPC | `epc-commercial:*` + revisions.json |

## 7. 参考文档

- [P2P 架构](../p2p/P2P_ARCHITECTURE.md)
- [社区 Hub](../community/COMMUNITY_ARCHITECTURE.md)
- [Agent Task Runtime](../agent-task-runtime.md)
- [EPC 引擎 README](../../packages/epc-commercial-engine/README.md)
