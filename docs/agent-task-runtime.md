# Agent Task Runtime 规格（T00）

> 版本：0.1 · 2026-07-01  
> 状态：M1 实施中（T00–T02）

本文定义 Toolman **自主任务执行 Runtime** 的数据模型、状态机、持久化策略与分层边界。  
**不修改**知识库、笔记、群组、社区模块；新能力集中在 `task-runtime` 与聊天侧任务 UI。

---

## 1. 架构分层

| 层 | 名称 | 职责 | 代码位置（规划） |
|----|------|------|------------------|
| L1 | Conversation Runtime | 单次发送、流式回复、Tool Loop | 已有 `agent-generation/` |
| L2 | **Task Runtime** | 任务 CRUD、状态机、恢复、与 Session 绑定 | `task-runtime/` |
| L3 | Planner | 只读探索 + 输出结构化计划 | `task-runtime/planner/`（T11+） |
| L4 | Executor | 按步骤调工具、timeout/retry/checkpoint | `task-runtime/executor/`（T08+） |
| L5 | Reflection | 阶段验收、replan/continue/abort | `task-runtime/reflection/`（T13+） |
| L6 | Task State | DB 权威 + `task.json` 快照 | `@toolman/db` + `task-runtime/store` |
| L7 | Task Workspace | 每任务独立目录 | `task-workspace.service`（T04） |
| L8 | Artifact | 产物注册（非聊天正文） | `artifact.service`（T05） |
| L9 | Background Agent | 队列 + Worker + Heartbeat 扩展 | `task-queue/`（T17+） |
| L10 | Event System | 生命周期事件 | `task-event.service`（T06+） |

**分流原则**：普通聊天仍走 L1；存在 `taskId` 或用户「升级为自主任务」时进入 L2 编排（T15+）。

---

## 2. 已确认产品决策

| # | 决策 |
|---|------|
| 1 | **DB 为主 + `task.json` 快照**（`{userData}/toolman/tasks/{taskId}/task.json`） |
| 2 | **MVP Rollback**：仅文件类工具（`fs_write`/`fs_edit`、Docx/Excel MCP 写操作）；bash/网络 **只 retry，不 rollback** |
| 3 | **Planner 模型**：设置页单独「规划模型」；任务记录 `plannerModelId`，Executor 可用助手默认 `modelId` |
| 4 | **Token 预算**：任务级，见 §5；本地 Ollama 偏大，网络 API 中等 |
| 5 | **并发**：MVP **单 Worker 单任务锁**（全局一条 lock 记录） |

---

## 3. 核心类型（`@toolman/shared/task-runtime`）

### 3.1 TaskStatus

```
pending → planning → executing → reflecting ⇄ retrying
                ↓         ↓           ↓
             paused    paused      paused
                ↓         ↓           ↓
         completed | failed | cancelled
```

| 状态 | 含义 |
|------|------|
| `pending` | 已创建，尚未规划 |
| `planning` | Planner 运行中 |
| `executing` | Executor 执行当前 step |
| `reflecting` | Reflection 评估上一阶段 |
| `retrying` | 工具失败后的重试窗口 |
| `paused` | 用户或系统暂停，可恢复 |
| `completed` | 目标达成（Reflection pass） |
| `failed` | 超过 retry 或 budget 或用户 abort |
| `cancelled` | 用户取消 |

### 3.2 TaskStepKind（Planner 输出）

`scan` · `classify` · `read` · `index` · `transform` · `output` · `report` · `tool` · `custom`

### 3.3 AgentTask（L2 主实体）

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | uuid | |
| `workspaceId` | uuid | |
| `assistantId` | uuid? | |
| `sessionId` | uuid? | 绑定来源对话 |
| `title` | string | 短标题 |
| `goal` | string? | 用户原始目标 |
| `status` | TaskStatus | |
| `currentStepId` | string? | 当前 step |
| `retryCount` | number | 任务级累计重试 |
| `plannerModelId` | string? | `providerId:model` |
| `executorModelId` | string? | 默认可继承助手 model |
| `workspaceRoot` | string? | 任务工作区根目录；文件工具默认使用 `{workspaceRoot}/files` |
| `history` | TaskStepRecord[] | 步骤历史（JSON） |
| `budget` | TaskTokenBudget | 预算与已用量 |
| `notes` | string? | 兼容旧 `agent_task_*` |
| `metadata` | object | 扩展 |
| `createdAt` / `updatedAt` | ms | |

### 3.4 TaskStepRecord

| 字段 | 说明 |
|------|------|
| `id` | step uuid |
| `kind` | TaskStepKind |
| `title` | 人类可读 |
| `status` | `pending` \| `running` \| `completed` \| `failed` \| `skipped` |
| `input` / `output` | JSON 摘要 |
| `error` | 最后一次错误 |
| `retryCount` | 本 step 重试次数 |
| `startedAt` / `finishedAt` | ms |

### 3.5 TaskTokenBudget

```ts
interface TaskTokenBudget {
  preset: 'local' | 'network' | 'custom'
  maxPlannerTokens: number
  maxExecutorTokensPerStep: number
  maxReflectionTokens: number
  maxTotalTokens: number
  maxSteps: number
  used: {
    planner: number
    executor: number
    reflection: number
    total: number
  }
}
```

**默认预设**（`packages/shared/src/task-runtime/token-budget.ts`）：

| 预设 | maxPlanner | maxExecutor/step | maxReflection | maxTotal | maxSteps |
|------|------------|------------------|---------------|----------|----------|
| `local` | 32_000 | 16_000 | 8_000 | 500_000 | 50 |
| `network` | 8_000 | 4_000 | 4_000 | 120_000 | 30 |

选择规则：任务创建时若 `plannerModelId` / `executorModelId` 解析为 `ollama` provider → `local`，否则 `network`；用户可在任务设置覆盖为 `custom`。

### 3.6 Worker Lock（MVP）

表 `agent_task_lock`：单行 `id = 'global'`

| 字段 | 说明 |
|------|------|
| `taskId` | 当前占用任务 |
| `workerId` | 进程内 uuid |
| `acquiredAt` | ms |

同一时刻仅一个 `in_progress` 类状态（planning/executing/reflecting/retrying）任务可持有锁。

---

## 4. 持久化

### 4.1 SQLite（权威）

- `agent_tasks` — 主表 + `history_json` + `budget_json` + `metadata_json`
- `agent_task_lock` — 单 Worker 锁

迁移：`packages/db/migrations/0010_agent_tasks.sql`

### 4.2 task.json 快照

路径：`{electron userData}/toolman/tasks/{taskId}/task.json`

每次 `AgentTaskRepository` 写入后异步刷新快照，便于：

- 崩溃恢复时与 DB 对账
- 外部工具/debug 直接读文件
- T04 Task Workspace 根目录与标准子目录（见 §11）

快照 schema 版本字段：`snapshotVersion: 1`

### 4.3 旧版 JSON 迁移（T24）

`{userData}/agent-tasks/{assistantId}.json` → 启动时 `bootstrapTaskRuntimeLegacyMigration()` 导入 `agent_tasks`（status 映射见 §6）。重复启动幂等；`metadata.legacyImport = true`。

---

## 5. Executor 策略（MVP，T08+ 实现）

| 工具类 | timeout | retry | rollback |
|--------|---------|-------|----------|
| `fs_*` 写 | 120s | 2，指数退避 | checkpoint 复制 |
| Docx/Excel MCP 写 | 180s | 2 | checkpoint |
| bash | 300s | 2 | **无** |
| fetch/http/github | 60s | 2 | **无** |
| 只读工具 | 60s | 1 | N/A |

---

## 6. 与 Session / 旧 API 的关系

- **Session**：`sessionId` 可选；message `metadata.taskId` 在 T03 添加。
- **旧 `agent_task_*` 工具**：保留签名；内部转发 `task-runtime/store` legacy 适配层。
- **状态映射**：

| 旧 `AgentTaskStatus` | 新 `TaskStatus` |
|----------------------|-----------------|
| `pending` | `pending` |
| `in_progress` | `executing` |
| `completed` | `completed` |
| `cancelled` | `cancelled` |

---

## 7. 设置页：规划模型（T03 后 UI）

- 全局设置项：`plannerModelId`（可选，默认空 = 与当前助手 model 相同）
- 助手级覆盖：`parameters.plannerModelId`（可选）
- 任务创建时：`task.plannerModelId = assistant.plannerModelId ?? global.plannerModelId ?? assistant.modelId`

---

## 8. Task Workspace 目录（T04）

每个任务拥有独立工作区根目录 `workspaceRoot`，默认解析顺序：

1. 创建时显式传入 `workspaceRoot`
2. 智能体 `parameters.workingDirectory` → `{workingDirectory}/.toolman/tasks/{taskId}`
3. `{userData}/toolman/tasks/{taskId}`

标准布局：

```
{workspaceRoot}/
├── task.json          # 快照（与 DB 同步）
├── files/             # 文件工具默认读写目录
├── artifacts/         # 产物（T05 注册）
├── cache/
├── temp/
├── logs/
└── checkpoints/       # 文件类工具 rollback（T08+）
```

任务 `metadata.workspaceLayoutVersion = 1` 表示布局已初始化。应用启动时会 best-effort 修复旧任务目录。

---

## 9. Task Artifact 注册（T05）

产物与聊天消息分离：文件写入 `{workspaceRoot}/artifacts/`（或引用工作区内已有文件），并在 SQLite `agent_task_artifacts` 登记。

### 9.1 TaskArtifact

| 字段 | 说明 |
|------|------|
| `id` | uuid |
| `taskId` | 所属任务 |
| `name` | 展示名称 |
| `kind` | `file` · `report` · `export` · `image` · `data` · `other` |
| `relativePath` | 相对 `artifacts/` 或任务根的路径标识 |
| `absolutePath` | 磁盘绝对路径 |
| `mimeType` | 可选 |
| `sizeBytes` | 文件大小 |
| `source` | 可选 `{ stepId, toolName, messageId }` |
| `metadata` | 扩展 JSON |

### 9.2 注册规则

`TaskArtifactRegister` 接受 `sourcePath`：

1. 已在 `artifacts/` 内 → 直接登记
2. 默认 `copy: true` → 复制到 `artifacts/` 并登记
3. `copy: false` 且源在任务工作区内 → 登记引用（不复制）
4. 源在工作区外且 `copy: false` → 拒绝

删除为软删除（保留磁盘文件）。`task.artifact.created` 事件由 T06 Event System 广播并写入日志。

---

## 10. Event System（T06）

任务生命周期事件通过 **推送 + JSONL 持久化** 双通道交付：

- **实时推送**：`agent:task:stream`（`window.api.subscribe`）
- **历史查询**：`agent:task:event:list` → 读取 `{workspaceRoot}/logs/events.jsonl`
- **服务入口**：`task-event.service.ts` 的 `emitTaskEvent()`

### 10.1 事件类型

| 类型 | 说明 | T06 已接入 |
|------|------|-----------|
| `task.started` | 任务创建 | ✅ createTask |
| `task.paused` | 用户暂停 | ✅ control pause |
| `task.resumed` | 用户恢复 | ✅ control resume |
| `task.finished` | 任务结束（completed/failed/cancelled） | ✅ control cancel |
| `task.artifact.created` | 产物注册 | ✅ artifact register |
| `task.step.started` | 步骤开始 | ✅ T10 executor |
| `task.tool.started` / `task.tool.finished` | 工具调用 | ✅ T08 tool-runner |
| `task.retry` | 重试 | ✅ T08 tool-runner |
| `task.checkpoint` | 检查点 | ✅ T09 checkpoint |
| `task.reflection` | 反思结果 | ✅ T13 reflection |

### 10.2 渲染层

`useTaskEvents(taskId)`：加载历史 + 订阅 `TaskStream` 实时更新。  
`TaskActivityPanel`：绑定话题的自主任务时，在对话区顶部展示最近 5 条事件（T07）。

### 10.3 事件总线（T07）

`task-event-bus.ts`：`publishTaskEvent` / `subscribeTaskEvents`（支持按 `taskId`、事件类型过滤）。  
发布顺序：校验 → 追加 `logs/events.jsonl` → 进程内订阅者 → IPC `TaskStream`。

---

## 11. Executor 工具包装（T08）

`task-runtime/executor/tool-runner.ts` 的 **`runTaskTool`** 在现有 `executeToolCall` 外包装：

| 能力 | 说明 |
|------|------|
| 策略 | `resolveTaskToolExecutionPolicy(toolName)`（见 §5 超时/重试表） |
| 超时 | `Promise.race` + 可取消 |
| 重试 | 指数退避（`computeRetryBackoffMs`） |
| 事件 | 发出 `task.tool.started` / `task.tool.finished` / `task.retry` |

T09 将在此基础上增加 checkpoint/rollback；T10 Executor 主循环将调用 `runTaskTool`。

---

## 12. Checkpoint 与 Rollback（T09）

对 `rollbackEligible` 工具（`fs_*` 写、Docx/Excel MCP 写），`runTaskTool` 在**首次执行前**创建检查点：

```
{workspaceRoot}/checkpoints/{checkpointId}/
├── manifest.json
└── data/0 …        # 受影响文件的备份（文件不存在则只记录 existed=false）
```

| 阶段 | 行为 |
|------|------|
| 执行前 | `createTaskToolCheckpoint` → 发出 `task.checkpoint` |
| 成功 | `cleanupTaskToolCheckpoint` 删除检查点目录 |
| 全部重试失败 | `rollbackTaskToolCheckpoint` 恢复/删除文件，保留检查点目录供排查 |

路径解析与工具执行一致（默认 `{workspaceRoot}/files` 沙箱）；仅备份任务工作区内的普通文件。bash/网络工具不创建检查点。

共享 helper：`extractTaskToolTargetPaths(toolName, argsJson)`（`@toolman/shared`）。

---

## 13. Executor 主循环（T10）

`executor/executor.service.ts` 的 **`runTaskExecutor`** 按 `history` 中 `pending` 步骤顺序执行，**不调用 LLM**：

| 能力 | 说明 |
|------|------|
| 入队 | `appendTaskToolSteps` 或 `TaskExecute` 的 `steps` 参数 |
| 锁 | 全局 `agent_task_lock`（MVP 单 Worker） |
| 执行 | `kind: tool` 步骤 → `runTaskTool` |
| 状态 | 更新 step / task；发出 `task.step.started` |
| 结束 | 全部完成 → `completed`；步骤失败 → `failed` |
| IPC | `agent:task:execute` |

步骤 input 形状：`{ toolName, argsJson, toolCallId? }`（见 `TaskToolStepPayloadSchema`）。

T11 Planner 产出步骤后调用 `TaskExecute`；T16 将把聊天 Tool Loop 分流到入队 + 执行。

---

## 14. Planner（T11–T12）

### 14.1 规划协议（T11）

共享类型 `@toolman/shared/task-runtime/plan`：

```json
{
  "goal": "用户目标",
  "summary": "可选摘要",
  "steps": [
    { "kind": "scan", "title": "...", "description": "..." },
    { "kind": "tool", "title": "...", "tool": { "toolName": "fs_write", "argsJson": "{...}" } }
  ]
}
```

`parseTaskPlanFromText` 从 LLM 输出中提取 JSON。带 `tool` 的步骤会转换为可执行 `kind: tool` 记录；其余 kind 由 Executor **跳过**（`skipped`）。

Prompt：`planner/planner-prompt.ts`（要求文件操作落成 `tool` 步骤，路径相对 `files/`）。

### 14.2 Task 集成（T12）

`runTaskPlanner`（`planner/planner.service.ts`）：

| 阶段 | 行为 |
|------|------|
| 校验 | 任务 `pending`，非 paused/terminal |
| 锁 | 全局 lock → `planning` |
| LLM | 一次 `chatComplete`（无工具），使用 `plannerModelId` |
| 持久化 | `replaceTaskPendingSteps` → `pending` |
| 预算 | 累加 `budget.used.planner` |
| 可选执行 | `execute: true` → 释放 lock → `runTaskExecutor` |

IPC：`agent:task:plan`（`TaskPlan`），参数 `{ taskId, execute?, workerId? }`。

---

## 15. Reflection（T13）

`reflection/reflection.service.ts` 的 **`runTaskReflection`** 评估任务进展（**不调用工具**）：

| 输入 | goal、步骤 history 摘要、已登记 artifacts |
| 输出 | `{ verdict, reason, summary?, nextSteps? }` |
| LLM | 一次 `chatComplete`，使用 `plannerModelId`，预算 `maxReflectionTokens` |
| 事件 | `task.reflection`（verdict: pass/fail/replan） |

**verdict 处理（MVP）**

| 原始 verdict | 行为 |
|--------------|------|
| pass | 无剩余 tool 步骤 → `completed`；否则 → `pending` |
| continue | → `pending`（事件 verdict 映射为 pass） |
| replan | 替换 pending 步骤（nextSteps）→ `pending` |
| fail / abort | → `failed` |

IPC：`agent:task:reflect`（`TaskReflect`），返回 `{ task, reflection, verdict }`。

---

## 15. 阶段门禁（T14）

Executor 每完成一个 tool step 后自动进入 Reflection（阶段门禁），并在 step 失败时按任务级重试预算回退。

### 15.1 流程

```
execute step → (success) → runStageGateAfterStep → reflection verdict
                ↓ fail
         scheduleStepRetry → pending + retryCount++  (或 retryCount≥3 → failed)
```

| 能力 | 说明 |
|------|------|
| 自动反思 | `runTaskExecutor` 默认 `reflectAfterStep: true`，每步完成后调用 `performTaskReflection` |
| replan | Reflection `replan` → `replaceTaskPendingSteps(nextSteps)` → 继续执行循环 |
| step 重试 | 工具层重试耗尽后，`scheduleStepRetry` 将 step 回退为 `pending`，任务 `retryCount++` |
| 上限 | `retryCount >= 3`（`TASK_MAX_RETRY_COUNT`）或 `budget.used.total >= maxTotalTokens` → `failed` + `task.finished` |

### 15.2 服务入口

- `stage-gate/stage-gate.service.ts`：`runStageGateAfterStep`、`scheduleStepRetry`
- `reflection/reflection.service.ts`：`performTaskReflection`（无锁，供 Executor 在持锁时调用）
- `packages/shared/task-runtime/limits.ts`：`TASK_MAX_RETRY_COUNT`、`isTaskBudgetExhausted`

---

## 16. Orchestrator（T15）

**`runTaskOrchestrator`** 封装 plan → execute（含 T14 阶段门禁）闭环，作为 L2 编排的统一入口。

### 16.1 流程

```
pending (无 steps) → runTaskPlanner(execute:false)
                  → runTaskExecutor(reflectAfterStep:true)
                  → completed | failed | paused
```

| 场景 | 行为 |
|------|------|
| 新建任务 | 先规划再执行 |
| 已有 pending tool steps | 跳过规划，直接执行（恢复/重试） |
| `skipPlan: true` | 仅执行，不调用 Planner |
| 暂停 / 取消 | 立即返回当前任务 |
| 预算耗尽 | `failed` + `task.finished` |

### 16.2 服务与 IPC

- `orchestrator/orchestrator.service.ts`：`runTaskOrchestrator`、`needsTaskPlanning`、`shouldRunTaskExecution`
- IPC：`agent:task:run`（`TaskRun`），入参 `{ taskId, workerId?, skipPlan? }`，出参 `{ task }`

T16 将在聊天发送路径绑定 `TaskRun`（自主任务模式）。

---

## 17. 聊天分流（T16）

当 `MessageSend` 携带 `options.taskId`（或 Session 已绑定 `activeTaskId`）时，**不再进入 L1 Tool Loop**，改走 L2 Orchestrator。

### 17.1 流程

```
用户发送 → agent-send 持久化 user 消息
         → taskId 存在 → runChatTaskOrchestration
                         → prepareTaskForChatSend（终态任务重置 / 更新 goal）
                         → runTaskOrchestrator
                         → 助手消息写入任务摘要（message.done）
         → 无 taskId   → runGeneration（L1 原路径）
```

| 行为 | 说明 |
|------|------|
| 分流条件 | `options.taskId` 或 Session `activeTaskId` |
| 自主任务创建 | Renderer `useChatSend` 在开启自主任务时 `TaskCreate`，并随发送传入 `taskId` |
| 终态任务续跑 | 已完成/失败/取消的任务收到新消息时重置为 `pending` 并清空 history |
| 多模型 | 仅首个 assistant 消息承接任务；其余标记 `aborted` |
| UI | `TaskActivityPanel` 展示任务事件；助手气泡显示最终摘要 |

### 17.2 服务入口

- `task-runtime/chat-task-send.service.ts`：`runChatTaskOrchestration`、`prepareTaskForChatSend`、`buildTaskAssistantReply`
- 挂载点：`agent-send.ts`（在群组代理分流之后）

---

## 18. Background Worker（T17）

MVP **单 Worker 单任务锁**：后台队列串行消费 `runTaskOrchestrator`，并在启动 / 心跳时恢复中断任务。

### 18.1 组件

| 模块 | 职责 |
|------|------|
| `task-queue/task-queue.service.ts` | `scheduleTaskRun` / `enqueueTaskRun`、FIFO 队列、同 taskId 去重 |
| `task-queue/task-resume.service.ts` | 启动时释放 stale lock、规范化中断状态、恢复入队 |
| `bootstrapTaskWorker()` | DB 初始化后扫描 workspace 内可恢复任务 |

### 18.2 恢复规则

- **Stale lock**：锁持有任务已非 active → 释放
- **中断状态**：`planning`/`reflecting` → `pending`；`executing`/`retrying` 中 `running` step → `pending`
- **可恢复**：`planning|executing|reflecting|retrying`，或 `pending` 且（无 history / 有 pending tool steps）

### 18.3 集成点

- `TaskRun` IPC / 聊天 `awaitTaskRun` → `scheduleTaskRun`（经 Worker 串行执行）
- 应用启动：`bootstrap/database.ts` → `bootstrapTaskWorker()`
- Heartbeat：`runTaskSchedulerTick`（T19）；可恢复任务优先于 L1 心跳消息

---

## 19. Worker 执行器（T18）

将队列消费从 `task-queue.service.ts` 拆出为 **`task-worker.service.ts`**，并接入可中断执行。

### 19.1 职责

| API | 说明 |
|-----|------|
| `executeTaskWorkerRun` | dequeue 后执行 `runTaskOrchestrator`，持有 Worker 级 `AbortController` |
| `abortTaskWorkerRun` | 中断正在运行的任务（pause/cancel/聊天 abort 触发） |
| `cancelScheduledTaskRun` | 取消尚未开始执行的队列项 |
| `getTaskWorkerSnapshot` | 当前 workerId / activeTaskIds |

### 19.2 中断集成

- **TaskControl pause/cancel** → `abortTaskWorkerRun` + `cancelScheduledTaskRun`
- **聊天 abort** → `assistantMessageId` 的 `AbortSignal` 链式传递到 Worker controller
- **TaskWorkerAbortedError** → 若任务已 paused/cancelled，聊天助手消息写入状态摘要而非 failed

---

## 20. Heartbeat Task Scheduler（T19）

将 Heartbeat 扩展为 **L2 任务调度器**：优先恢复/续跑任务，仅在无任务可调度时回退 L1 心跳消息。

### 20.1 `task-scheduler.service.ts`

| API | 说明 |
|-----|------|
| `runTaskSchedulerTick` | 扫描 Session `activeTaskId` + 助手任务列表，调度首个可运行任务 |
| `resumePausedTaskAndSchedule` | 自动 resume `paused` 任务并入队 Worker |
| `scheduleTaskIfNeeded` | paused → resume；否则 → `resumeTaskIfNeeded` |

### 20.2 Heartbeat 优先级

```
heartbeatEnabled 助手 tick
  → runTaskSchedulerTick (L2 enqueue)
  → scheduled? 结束（不发 L1 消息）
  → idle? 回退 sendMessage 心跳（L1 Tool Loop）
```

扫描范围：Session 绑定任务 → 助手名下 `paused` / 可恢复任务（最多 20 条）。

### 20.3 周期性任务 enqueue

当 tick 仍为 `idle` 时，`enqueuePeriodicHeartbeatTask` 创建 **系统心跳任务**（`metadata.heartbeatPeriodic`），绑定 Session 并入队 Worker；若助手仍有可恢复工作或持有全局锁则跳过。Heartbeat 仅在周期性 enqueue 也失败时回退 L1 `sendMessage`。

---

## 21. 任务 UI（T20–T22）

| 组件 | 说明 |
|------|------|
| `TaskSidebarSection` | Chat 侧栏任务列表 + pause/resume/cancel |
| `TaskDetailPanel` | 对话区详情：事件时间线 + Artifact |
| Composer 自主任务按钮 | T03 已有；T22 与 Session 绑定联动 |

### 21.1 列表 UI 增强

| 能力 | 说明 |
|------|------|
| 筛选 | 全部 / 进行中 / 已结束 |
| 进度 | 工具步骤完成度进度条 |
| 元信息 | 相对更新时间、重试次数、话题绑定标记 |
| 空态 | 引导开启「升级为自主任务」 |
| E2E | `data-testid` 供 Playwright 选择器使用 |

### 21.2 对话区任务动态（T27）

| 组件 | 说明 |
|------|------|
| `TaskActivityPanel` | 话题绑定自主任务时，消息区顶部展示最近 5 条事件 |
| `TaskTimelineItem` | 事件标签 + 时间戳 + 类型样式（详情与动态共用） |
| Composer E2E | 工具栏「升级为自主任务」→ 发送 → 侧栏 + 动态面板可见 |

---

## 22. 测试与迁移（T23–T24）

### 22.1 集成测试（T23）

`task-lifecycle.integration.test.ts` 覆盖端到端编排链路（内存 Repository + 真实 Planner/Executor/Reflection/Orchestrator）：

```
create task → plan 3 steps → tool 失败 → retry
           → reflection continue → step 2 → reflection replan
           → verify step → reflection pass → completed
```

### 22.2 Legacy 迁移（T24）

- 启动时 `bootstrapTaskRuntimeLegacyMigration()` 读取 `{userData}/agent-tasks/{assistantId}.json`
- `migrateLegacyAgentTasksFile` / `migrateAllLegacyAgentTasks` 幂等导入 SQLite
- `legacy-migration.integration.test.ts` 验证导入、状态映射（`in_progress` → `executing`）与 bootstrap 单次执行

测试辅助：`testing/in-memory-agent-task.repository.ts`（无 better-sqlite3 依赖）。

### 22.3 生产环境 E2E（Playwright）

`apps/desktop/e2e/task-runtime.spec.ts`（需先 `pnpm --filter @toolman/desktop build`）：

- 经 IPC 创建任务 → 侧栏列表可见
- 详情面板 pause / resume / cancel
- 筛选器：全部 / 进行中 / 已结束
- Composer 自主任务模式：工具栏切换 → 发送 → 侧栏 + 动态面板

辅助：`e2e/fixtures/task-runtime.ts`

---

## 23. 明确不接入 Task Runtime 的路径

- EPC Rust 工作流（`/epc …`、快捷短语）
- 知识库 ingest / 笔记 CRUD / P2P 群组同步 / 社区 API
- Docx/Excel **结构化审核流水线**（可后续作为 Executor 特殊 step 调用，M1 不改动）

---

## 24. 实施里程碑对照

| 任务 | 内容 | 状态 |
|------|------|------|
| T00 | 本文档 | ✅ |
| T01 | 类型 + DB + Repository + Store + 快照 + legacy 适配 | ✅ |
| T02 | IPC CRUD + TaskControl + 状态机 + 规划模型解析 | ✅ |
| T03 | Session 绑定 + 规划模型设置 UI | ✅ |
| T04 | Task Workspace 目录布局 + 创建/启动修复 | ✅ |
| T05 | Artifact 注册 + IPC + DB | ✅ |
| T06 | Event System（推送 + JSONL + IPC） | ✅ |
| T07 | 事件总线 + 任务动态 UI | ✅ |
| T08 | Tool 执行包装器（timeout/retry/backoff） | ✅ |
| T09 | Checkpoint + Rollback（文件类工具） | ✅ |
| T10 | Executor 主循环（按 step 执行 + IPC） | ✅ |
| T11 | Planner 协议 + Prompt + Plan 解析 | ✅ |
| T12 | Planner ↔ Task 集成（planning → steps → execute） | ✅ |
| T13 | Reflection 协议 + 阶段验收 | ✅ |
| T14 | 阶段门禁（Executor ↔ Reflection + step 重试 + 预算上限） | ✅ |
| T15 | Orchestrator（plan → execute 闭环 + TaskRun IPC） | ✅ |
| T16 | 聊天分流（taskId → L2 Orchestrator，跳过 L1 Tool Loop） | ✅ |
| T17 | Background Worker（队列 + 启动恢复 + Heartbeat 续跑） | ✅ |
| T18 | Worker 执行器（dequeue + AbortController + TaskControl 中断） | ✅ |
| T19 | Heartbeat → Task Scheduler（L2 优先，L1 回退 + 周期性 enqueue） | ✅ |
| T20 | 任务侧栏列表 + 控制按钮 | ✅ |
| T21 | 任务详情 + 事件时间线 + Artifact | ✅ |
| T22 | 「升级为自主任务」入口（T03 + polish） | ✅ |
| T23 | 集成测试（plan → retry → replan → complete） | ✅ |
| T24 | 旧 `agent_task_*` JSON 迁移 + bootstrap 验收 | ✅ |
| T25 | 生产环境 E2E（Playwright task-runtime） | ✅ |
| T26 | 任务列表 UI 增强（筛选/进度/空态/testid） | ✅ |
| T27 | 任务动态面板 + 时间线增强 + Composer E2E | ✅ |
