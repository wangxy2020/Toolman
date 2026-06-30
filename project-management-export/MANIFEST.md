# Cherry Studio 项目管理模块 — 导出清单

> 生成自 cherry-studio-1.8.2，用于迁移到其他 Electron/React 项目。

## 模块架构概览

项目管理 **不是** 单一独立文件夹，而是由 UI、Rust 引擎、主进程服务、共享类型、智能体集成五层组成：

```
┌─────────────────────────────────────────────────────────────────┐
│  UI 层：/project-manager 路由页 + EPC 工作流 UI 组件              │
├─────────────────────────────────────────────────────────────────┤
│  智能体集成：AgentEmbeddedWorkspace + Claude Code 工具写表修订层   │
├─────────────────────────────────────────────────────────────────┤
│  IPC：preload window.api.epcCommercial ↔ main EpcCommercialService │
├─────────────────────────────────────────────────────────────────┤
│  主进程：epcCommercial/ + projectManagement/RevisionService      │
├─────────────────────────────────────────────────────────────────┤
│  Rust 引擎：packages/epc-commercial-engine (BOQ/IPC/付款/发货 CI)   │
├─────────────────────────────────────────────────────────────────┤
│  工作区数据：{workspace}/.cherry-studio/project-management/       │
│             IPC_Payment_data/、*_aligned.xlsx、ipc_process_log.txt │
└─────────────────────────────────────────────────────────────────┘
```

## 1. 核心源码（已包含在本包）

### 1.1 前端 UI — `src/renderer/src/project-manager/`（10 文件）

| 文件 | 职责 |
|------|------|
| `ProjectManagerPage.tsx` | 主页面：左侧 Tab、顶栏、创建表单、嵌入智能体工作区 |
| `CostManagementDashboard.tsx` | 成本管理看板（当前为 MOCK 数据） |
| `ProgressManagementDashboard.tsx` | 计划管理看板（当前为 MOCK 数据） |
| `projectSidebarMenuConfig.ts` | 左侧菜单 Tab 配置与 localStorage 偏好 |
| `ProjectSidebarMenuSettings.tsx` | 菜单显示/排序设置 UI |
| `useProjectSidebarMenuPreferences.ts` | 菜单偏好 Hook |
| `projectManagementAgentSlots.ts` | 计划/成本智能体槽位绑定 |
| `useProjectManagementAgentSlot.ts` | 槽位 → Agent 自动切换 |
| `costManagementTypes.ts` | 顶栏视图类型 |
| `index.ts` | 路由懒加载入口 |

### 1.2 EPC 商业工作流 UI — `src/renderer/src/components/epc-commercial/`（32 文件）

工作 1–5 的命令触发、报告卡片、消息解析、斜杠命令 pick 等。与智能体聊天、Markdown 渲染联动。

### 1.3 主进程服务

- `src/main/services/epcCommercial/` — Rust CLI 封装、Excel 安全写入、许可证
- `src/main/services/projectManagement/` — 修订层 `revisions.json` 读写与 diff 记录

### 1.4 Rust 引擎 — `packages/epc-commercial-engine/`

闭源 Rust crate，需 `pnpm epc:build` 编译为 `epc-commercial-cli` 二进制。

### 1.5 共享类型 — `packages/shared/`

- `projectManagementRevision.ts` — 修订层 schema 与路径规则
- `epcCommercialTypes.ts` — IPC 参数/响应类型
- `epcCommercialQuickPhrase.ts` — 工作 4 内置快捷短语（产品授权文案）
- `epcCommercialSlash.ts` — 斜杠命令规范化
- `epcDataUpdate.ts`、`epcWorkflowLog.ts` — 数据更新与日志
- `epcWork{1,2,5}*QuickPhrase.ts` — 各工作流短语

### 1.6 脚本

- `scripts/epc-generate-license.ts` — 生产 license.key 生成

## 2. 程序边界（未包含、需手动接入）

以下文件 **不在本包内**，迁移时必须在新项目中对应修改：

### 2.1 路由与导航

| 位置 | 改动 |
|------|------|
| `src/renderer/src/Router.tsx` | 注册 `/project-manager` 懒加载路由 |
| `src/renderer/src/components/app/HeavyRouteLayer.tsx` | 重路由保活 |
| `src/renderer/src/heavyRouteVisit.ts` | `projectManager` 访问标记 |
| `src/renderer/src/routePreload.ts` | 悬停预加载 |
| `src/renderer/src/components/app/Sidebar.tsx` | `project_manager` → `/project-manager` |
| `src/renderer/src/config/sidebar.ts` | 侧边栏图标 key 列表 |
| `src/renderer/src/hooks/scopedSidebarVisibility.ts` | PM 页侧栏可见性 store |
| `src/renderer/src/store/migrate.ts` | Redux 迁移：默认显示 PM 图标 |

### 2.2 IPC 三件套

| 位置 | 改动 |
|------|------|
| `packages/shared/IpcChannel.ts` | `EpcCommercial_*` 共 13 个 channel |
| `src/main/ipc.ts` | `ipcMain.handle` 注册 |
| `src/preload/index.ts` | `window.api.epcCommercial` 暴露 |

### 2.3 智能体子系统（强依赖）

| 位置 | 改动 |
|------|------|
| `src/renderer/src/pages/agents/AgentEmbeddedWorkspace.tsx` | `managementAgentSlot` 嵌入模式 |
| `src/main/services/agents/services/claudecode/index.ts` | Write/Edit 后 `recordPmDataFileWriteDiff` |
| `src/main/services/agents/services/claudecode/commands.ts` | EPC 斜杠命令 |
| `src/main/services/agents/services/SessionService.ts` | 斜杠命令规范化 |
| `src/renderer/src/pages/agents/components/AgentSessionInputbar.tsx` | 快捷短语/斜杠触发工作流 |
| `src/renderer/src/services/QuickPhraseService.ts` | 内置 EPC 短语注入 |
| `src/renderer/src/pages/home/Inputbar/tools/applyAgentSlashCommand.ts` | 斜杠命令执行 |

### 2.4 消息/Markdown 渲染

| 位置 | 改动 |
|------|------|
| `src/renderer/src/pages/home/Messages/Blocks/MainTextBlock.tsx` | EPC 报告卡片渲染 |
| `src/renderer/src/pages/home/Markdown/Table.tsx` | 发现表检测 |
| `src/renderer/src/utils/messageUtils/find.ts` | EPC 消息查找 |

### 2.5 i18n

`src/renderer/src/i18n/locales/*.json` 中 `title.project_manager` 及各语言翻译。

### 2.6 类型

`src/renderer/src/types/index.ts` — `SidebarIcon` 联合类型含 `'project_manager'`。

### 2.7 构建

`package.json` — `"epc:build"` 脚本；打包时需将 `epc-commercial-cli` 打入 Electron resources。

## 3. 外部依赖

- **Agents 子系统**：SQLite Drizzle、`ApiServerService`、Claude Agent SDK
- **UI 库**：Ant Design 5、styled-components、lucide-react、motion/react
- **Excel**：`@e965/xlsx`（主进程修订层 diff）、Rust 侧 calamine/rust_xlsxwriter
- **Electron**：IPC、userData 路径、文件系统访问
- **工作区模型**：Agent 工作区根目录作为 EPC 数据根

## 4. 数据模型边界

- **无独立 Redux slice / IndexedDB 表** — PM 偏好存 localStorage
- **业务数据在工作区文件系统**：
  - `.cherry-studio/project-management/revisions.json`
  - `IPC_Payment_data/ipc_payment_data.xlsx`
  - `*_aligned.xlsx`、清洗 CSV、`ipc_process_log.txt`

## 5. 迁移建议

1. **最小可行**：仅迁移 `project-manager/` UI + 路由/侧栏 — 看板可用 MOCK，无 Rust/智能体
2. **完整 EPC 工作流**：本包全部 + §2 集成点 + 编译 Rust 引擎
3. **解耦智能体**：将 `AgentEmbeddedWorkspace` 替换为 iframe/独立聊天组件，重写 claudecode 修订层钩子

## 6. 构建 Rust 引擎

```bash
pnpm epc:build
# 产物：packages/epc-commercial-engine/target/release/epc-commercial-cli
```

开发可设 `EPC_COMMERCIAL_DEV_SKIP_LICENSE=1`。
