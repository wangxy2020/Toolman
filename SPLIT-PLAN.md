# 超 300 行文件分拆计划

> 扫描日期：2026-08-16  
> 范围：`apps/desktop/src`、`apps/mobile/src`、`packages/{shared,db,knowledge,model-gateway,sync-client}/src`  
> 合计：**158** 个文件 >300 行  
> **状态（2026-08-16）：Wave A–D 已完成。** SPLIT 目标剩余 **0**；仅保留清单内 KEEP（13 个，均 ≤600）。`pnpm --filter @toolman/desktop typecheck` 与 `pnpm --filter @toolman/mobile typecheck` 通过。

## 原则

1. 默认每个文件 **≤300 行**。
2. **特殊文件 ≤600 行**：IPC 契约、图标目录、内聚测试套件、单一数据种子。
3. 拆分必须 **向下兼容**：原路径继续导出同样的函数 / Hook / 组件 / Type；调用方可以不改 import。
4. UI 只留展示；状态与数据处理进 Hook 或纯函数。
5. 一次一个领域发 PR，先 `pnpm typecheck` 再合。

## 无法拆到 300 行

| 行数 | 文件 | 原因 |
|---:|---|---|
| 505 | `packages/shared/src/ipc/channels.ts` | IPC 通道名必须集中注册，拆开会让所有调用方改 import。已 ≤600。 |
| 495 | `packages/shared/src/project-management/pm-builtin-emp-2401.ts` | 一份完整 EMP-2401 种子常量，拆开会失去「整包样例」可读性。已 ≤600。 |

## 特殊保留（≤600，不强制拆到 300）

| 行数 | 文件 | 原因 |
|---:|---|---|
| 582 | `pm-gantt-resource-assignment.test.ts` | 内聚测试套件 |
| 547 | `pm-gantt-schedule.test.ts` | 同上 |
| 538 | `pm-plan-apply.test.ts` | 同上 |
| 469 | `pm-resource-catalog.test.ts` | 同上 |
| 432 | `apps/desktop/.../icons/actions.tsx` | SVG 图标目录 |
| 369 | `pm-save-history.test.ts` | 内聚测试套件 |
| 362 | `pm-gantt-cost-assignment.test.ts` | 同上 |
| 354 | `pm-cost-catalog-agent.ts` | 智能体改目录的内聚纯函数 |
| 342 | `pm-resource-catalog-agent.ts` | 同上 |
| 332 | `apps/mobile/src/icons/composer-icons.tsx` | SVG 图标目录 |
| 325 | `pm-gantt-prefs.test.ts` | 内聚测试套件 |

唯一超过 600 的测试：`pm-feature-gantt-rollup.test.ts`（1063）必须拆，见 Wave A。

## 建议波次

每波保持对外 API 不变，做完跑 `pnpm typecheck`。

### Wave A — 最大痛点（>1000 行）

甘特 / 成本 / 资源 hook、文档解析、翻译分页、IPC community、PM i18n、移动群聊、rollup 测试。

### Wave B — 桌面项目管理 600–1000

菜单栏、目录、甘特 prefs/utils/assignment、seed、document.repository。

### Wave C — 移动端 UI / 同步 400–850

Group/Agent/Settings panes 与 modal；`mobileSync` / `localAuth` / `communityHubClient`。

### Wave D — 其余 301–600

翻译页、笔记编辑器、task-runtime、EPC report utils、较小 hook/面板。

## 完整清单

| # | 行数 | 处置 | 文件 | 拆法 |
|---:|---:|---|---|---|
| 1 | 2395 | 拆到 ≤300 | `apps/desktop/src/renderer/features/project-manager/views/schedule/useProjectScheduleGanttPanel.ts` | 拆 `useGanttProjectLoad` / `useGanttRowEditing` / `useGanttAssignments` / `useGanttBaseline` / `useGanttPrint` / `useGanttMenuActions`；本 hook 只组装，导出与 `ScheduleGanttPanelState` 不变。 |
| 2 | 2192 | 拆到 ≤300 | `apps/desktop/src/renderer/features/project-manager/views/cost/useProjectCostTablePanel.ts` | 拆 load-save / row-edit / import / selection / summary 子 hook，本文件做门面。 |
| 3 | 1632 | 拆到 ≤300 | `apps/desktop/src/main/services/document-parser.service.ts` | 拆 `document-parser-odl-preview.ts` / `document-parser-hybrid-ingest.ts` / `document-parser-translation.ts` / `document-parser-builtin-pdf.ts` / `document-parser-cache.ts`，本文件 re-export 现有函数名。 |
| 4 | 1579 | 拆到 ≤300 | `apps/desktop/src/renderer/features/translation/useDocumentPageTranslation.ts` | 拆 parse / prefetch / ocr-backfill / translate-batch 子 hook。 |
| 5 | 1573 | 拆到 ≤300 | `apps/desktop/src/renderer/features/project-manager/views/files/pm-feature-gantt-rollup.ts` | 拆 funds / node / procurement / schedule 四个 rollup 纯函数文件，本文件 re-export。 |
| 6 | 1544 | 拆到 ≤300 | `apps/desktop/src/renderer/features/project-manager/views/resource/useProjectResourceTablePanel.ts` | 与成本表对称：load-save / edit / import / selection。 |
| 7 | 1454 | 拆到 ≤300 | `apps/desktop/src/renderer/features/project-manager/views/files/useProjectManagementFilesPanel.ts` | 拆 matrix 数据 / 筛选 / 与甘特同步，UI 已在 Matrix 组件。 |
| 8 | 1436 | 拆到 ≤300 | `apps/desktop/src/renderer/features/project-manager/views/resource/pm-resource-catalog.ts` | 拆 types / compute / io，本文件 re-export。 |
| 9 | 1378 | 拆到 ≤300 | `apps/desktop/src/renderer/features/project-manager/views/files/ProjectManagementFilesPanelMatrix.tsx` | 拆表头、行、单元格、汇总行。 |
| 10 | 1275 | 拆到 ≤300 | `packages/shared/src/ipc/community.ts` | 按已有分区拆 `community-enums.ts` / `community-hub.ts` / `community-marketplace.ts` / `community-install.ts` / `community-news.ts` / `community-board.ts`，本文件只 re-export。 |
| 11 | 1249 | 拆到 ≤300 | `apps/desktop/src/renderer/i18n/locales/partials/pages/project-manager.en.ts` | 按顶层 key 拆 sidebar/toolbar/gantt/cost/resource/files/projectInfo，`project-manager.en.ts` 合并导出。 |
| 12 | 1228 | 拆到 ≤300 | `apps/desktop/src/renderer/i18n/locales/partials/pages/project-manager.zh-CN.ts` | 与英文文件同一拆法，key 对齐。 |
| 13 | 1089 | 拆到 ≤300 | `apps/mobile/src/features/useGroupChat.ts` | 拆 messages / send / mailbox / members 子 hook；`useGroupChat` / `GroupChatProvider` 签名不变。 |
| 14 | 1085 | 拆到 ≤300 | `apps/desktop/src/renderer/features/project-manager/views/schedule/useProjectInfoDialog.ts` | 拆 draft / cost-currency / save / tabs 子 hook。 |
| 15 | 1063 | 拆到 ≤300 | `apps/desktop/src/renderer/features/project-manager/views/files/pm-feature-gantt-rollup.test.ts` | 按 funds / node / procurement / schedule 与源文件同步拆成 4 个测试文件。 |
| 16 | 1050 | 拆到 ≤300 | `packages/shared/src/project-management/pm-plan-apply.ts` | 拆 parse-markdown / apply-patch / validate。 |
| 17 | 1041 | 拆到 ≤300 | `apps/desktop/src/renderer/features/project-manager/views/schedule/ProjectGanttTaskGridBody.tsx` | 拆行、单元格编辑、分配徽标。 |
| 18 | 1007 | 拆到 ≤300 | `apps/desktop/src/renderer/features/project-manager/views/schedule/useProjectGanttTaskGrid.ts` | 拆虚拟滚动/列宽/选区。 |
| 19 | 910 | 拆到 ≤300 | `apps/desktop/src/renderer/features/project-manager/views/schedule/pm-gantt-prefs.ts` | 拆 defaults / storage / column-config。 |
| 20 | 895 | 拆到 ≤300 | `apps/desktop/src/renderer/features/project-manager/views/cost/pm-cost-catalog.ts` | 拆 types / rollup / sectional-display / io。 |
| 21 | 877 | 拆到 ≤300 | `apps/desktop/src/main/services/project-management/pm-seed.service.ts` | 按 plan/cost/resource/emp2401 seed 拆，本文件做门面。 |
| 22 | 841 | 拆到 ≤300 | `apps/desktop/src/renderer/features/project-manager/views/schedule/ProjectGanttMenuBar.tsx` | 按文件/编辑/视图/工具菜单组拆。 |
| 23 | 830 | 拆到 ≤300 | `apps/mobile/src/features/GroupPagePanels.tsx` | 成员/资源/动态/设置各一文件，本文件组装。 |
| 24 | 829 | 拆到 ≤300 | `apps/desktop/src/renderer/features/project-manager/views/resource/ProjectResourceMenuBar.tsx` | 按菜单组拆，与甘特菜单栏相同。 |
| 25 | 825 | 拆到 ≤300 | `packages/db/src/repositories/document.repository.ts` | list/search/fts/mutate 拆 mixin 或子模块，class 门面保留。 |
| 26 | 773 | 拆到 ≤300 | `apps/desktop/src/renderer/features/project-manager/views/schedule/pm-gantt-utils.ts` | 日期/层级/过滤/打印。 |
| 27 | 751 | 拆到 ≤300 | `apps/mobile/src/features/GroupPanes.tsx` | 共享智能体列表与话题行拆展示组件。 |
| 28 | 746 | 拆到 ≤300 | `apps/mobile/src/features/AgentPanes.tsx` | AgentLeftPane / AgentRightPane / AgentStreamMessage / agentPaneStyles。 |
| 29 | 745 | 拆到 ≤300 | `apps/desktop/src/renderer/features/project-manager/views/cost/pm-cost-import.ts` | parse-table / map-columns / write-catalog。 |
| 30 | 732 | 拆到 ≤300 | `apps/desktop/src/renderer/features/project-manager/views/schedule/pm-gantt-cost-assignment.ts` | parse / write / summarize。 |
| 31 | 715 | 拆到 ≤300 | `packages/shared/src/ipc/knowledge.ts` | base / document / ingest / watch，本文件 re-export。 |
| 32 | 703 | 拆到 ≤300 | `apps/desktop/src/renderer/features/notes/notes-rich-editor.ts` | schema / commands / serialize。 |
| 33 | 701 | 拆到 ≤300 | `apps/desktop/src/main/services/task-runtime/planner/plan-repair.ts` | 按 repair 策略拆纯函数。 |
| 34 | 684 | 拆到 ≤300 | `apps/desktop/src/renderer/features/project-manager/views/files/pm-features-catalog.ts` | types+factory vs filter/rollup。 |
| 35 | 668 | 拆到 ≤300 | `apps/mobile/src/features/AgentSettingsModal.tsx` | 表单段拆子组件，modal 容器保留。 |
| 36 | 666 | 拆到 ≤300 | `apps/desktop/src/renderer/features/project-manager/views/files/ProjectFeaturesMenuBar.tsx` | 按菜单组拆。 |
| 37 | 661 | 拆到 ≤300 | `packages/shared/src/ipc/p2p.ts` | workspace / member / share / mailbox，本文件 re-export。 |
| 38 | 648 | 拆到 ≤300 | `apps/mobile/src/features/ClassroomSettingsModal.tsx` | 表单段拆子组件。 |
| 39 | 639 | 拆到 ≤300 | `apps/mobile/src/features/CommunityPublishModals.tsx` | 按资源类型各一个 modal 文件。 |
| 40 | 639 | 拆到 ≤300 | `apps/desktop/src/renderer/features/project-manager/views/schedule/pm-gantt-resource-assignment.ts` | parse / write / summarize。 |
| 41 | 629 | 拆到 ≤300 | `apps/mobile/src/features/ChatComposer.tsx` | 抽子组件或 StyleSheet，容器 Props 不变。 |
| 42 | 619 | 拆到 ≤300 | `apps/mobile/src/features/settingsUi.tsx` | 抽子组件或 StyleSheet，容器 Props 不变。 |
| 43 | 617 | 拆到 ≤300 | `apps/mobile/src/features/useAgentRightPane.ts` | 抽纯函数或 1 个子 hook，原 hook 同名导出。 |
| 44 | 610 | 拆到 ≤300 | `apps/desktop/src/main/services/project-management/pm-baseline.service.ts` | 按职责拆子模块，本文件做门面并保持导出。 |
| 45 | 609 | 拆到 ≤300 | `apps/mobile/src/sync/mobileSync.ts` | 按单一职责抽纯函数/子模块，原路径 re-export。 |
| 46 | 605 | 拆到 ≤300 | `packages/shared/src/ipc/agent.ts` | session / message / assistant / provider，本文件 re-export（605 行已略超 600）。 |
| 47 | 603 | 拆到 ≤300 | `apps/mobile/src/features/communityPanelUi.tsx` | 抽子组件或 StyleSheet，容器 Props 不变。 |
| 48 | 602 | 拆到 ≤300 | `apps/mobile/src/features/GroupSettingsModal.tsx` | 抽子组件或 StyleSheet，容器 Props 不变。 |
| 49 | 590 | 拆到 ≤300 | `apps/mobile/src/features/communityHubClient.ts` | 按单一职责抽纯函数/子模块，原路径 re-export。 |
| 50 | 586 | 拆到 ≤300 | `apps/mobile/src/auth/localAuth.ts` | 按单一职责抽纯函数/子模块，原路径 re-export。 |
| 51 | 582 | 特殊保留 | `apps/desktop/src/renderer/features/project-manager/views/schedule/pm-gantt-resource-assignment.test.ts` | 内聚测试套件，已 ≤600。 |
| 52 | 566 | 拆到 ≤300 | `apps/desktop/src/renderer/features/assistant-lib/AssistantLibSettingsDialog.tsx` | 抽子组件或 StyleSheet，容器 Props 不变。 |
| 53 | 562 | 拆到 ≤300 | `packages/shared/src/project-management/epc/epcCommercialTypes.ts` | 按单一职责抽纯函数/子模块，原路径 re-export。 |
| 54 | 561 | 拆到 ≤300 | `packages/shared/src/project-management/pm-save-history.ts` | 按单一职责抽纯函数/子模块，原路径 re-export。 |
| 55 | 552 | 拆到 ≤300 | `apps/desktop/src/renderer/features/project-manager/views/schedule/pm-gantt-schedule.ts` | 按单一职责抽纯函数/子模块，原路径 re-export。 |
| 56 | 547 | 特殊保留 | `apps/desktop/src/renderer/features/project-manager/views/schedule/pm-gantt-schedule.test.ts` | 内聚测试套件，已 ≤600。 |
| 57 | 538 | 特殊保留 | `packages/shared/src/project-management/pm-plan-apply.test.ts` | 内聚测试套件，已 ≤600。 |
| 58 | 534 | 拆到 ≤300 | `packages/shared/src/project-management/pm-resource-apply.ts` | 按单一职责抽纯函数/子模块，原路径 re-export。 |
| 59 | 532 | 拆到 ≤300 | `apps/desktop/src/renderer/features/translation/useTranslationPage.ts` | 抽纯函数或 1 个子 hook，原 hook 同名导出。 |
| 60 | 526 | 拆到 ≤300 | `apps/desktop/src/renderer/features/project-manager/ProjectManagerPage.tsx` | 抽子组件或 StyleSheet，容器 Props 不变。 |
| 61 | 521 | 拆到 ≤300 | `apps/mobile/src/features/ModulePanes.tsx` | 抽子组件或 StyleSheet，容器 Props 不变。 |
| 62 | 508 | 拆到 ≤300 | `apps/mobile/src/features/useUserSettingsPanel.ts` | 抽纯函数或 1 个子 hook，原 hook 同名导出。 |
| 63 | 507 | 拆到 ≤300 | `apps/desktop/src/renderer/features/project-manager/views/cost/pm-cost-summary.ts` | 按单一职责抽纯函数/子模块，原路径 re-export。 |
| 64 | 505 | 无法拆分 | `packages/shared/src/ipc/channels.ts` | IPC 通道名单一注册表，拆开后调用方要对多文件 import。505 行已满足特殊上限。 |
| 65 | 505 | 拆到 ≤300 | `apps/desktop/src/renderer/features/project-manager/views/resource/ProjectResourceTableGrid.tsx` | 抽子组件或 StyleSheet，容器 Props 不变。 |
| 66 | 497 | 拆到 ≤300 | `apps/mobile/src/features/ProjectStatsUi.tsx` | 抽子组件或 StyleSheet，容器 Props 不变。 |
| 67 | 495 | 无法拆分 | `packages/shared/src/project-management/pm-builtin-emp-2401.ts` | 单一 `PM_BUILTIN_EMP_2401` 种子对象，拆开会打散一份完整样例。495 行已满足特殊上限。 |
| 68 | 495 | 拆到 ≤300 | `apps/mobile/src/features/UserSettingsPanel.tsx` | 抽子组件或 StyleSheet，容器 Props 不变。 |
| 69 | 482 | 拆到 ≤300 | `apps/mobile/src/features/MessageMarkdown.tsx` | 抽子组件或 StyleSheet，容器 Props 不变。 |
| 70 | 473 | 拆到 ≤300 | `apps/mobile/src/features/AboutSettingsPanel.tsx` | 抽子组件或 StyleSheet，容器 Props 不变。 |
| 71 | 469 | 特殊保留 | `apps/desktop/src/renderer/features/project-manager/views/resource/pm-resource-catalog.test.ts` | 内聚测试套件，已 ≤600。 |
| 72 | 466 | 拆到 ≤300 | `apps/mobile/src/features/ProjectPanes.tsx` | 抽子组件或 StyleSheet，容器 Props 不变。 |
| 73 | 465 | 拆到 ≤300 | `apps/desktop/src/renderer/features/project-manager/views/schedule/ProjectGanttCostAssignPopup.tsx` | 抽子组件或 StyleSheet，容器 Props 不变。 |
| 74 | 465 | 拆到 ≤300 | `apps/desktop/src/main/services/p2p/p2p-mailbox.service.ts` | 按职责拆子模块，本文件做门面并保持导出。 |
| 75 | 462 | 拆到 ≤300 | `apps/desktop/src/renderer/features/project-manager/views/schedule/ProjectGanttResourceAssignPopup.tsx` | 抽子组件或 StyleSheet，容器 Props 不变。 |
| 76 | 459 | 拆到 ≤300 | `apps/desktop/src/main/services/mobile-sync-hub.ts` | 按单一职责抽纯函数/子模块，原路径 re-export。 |
| 77 | 455 | 拆到 ≤300 | `packages/shared/src/project-management/pm-cost-apply.ts` | 按单一职责抽纯函数/子模块，原路径 re-export。 |
| 78 | 454 | 拆到 ≤300 | `apps/mobile/src/state/MobileAppRoot.tsx` | 抽子组件或 StyleSheet，容器 Props 不变。 |
| 79 | 452 | 拆到 ≤300 | `apps/desktop/src/renderer/features/project-manager/useProjectPlanAgentApplyBar.ts` | 抽纯函数或 1 个子 hook，原 hook 同名导出。 |
| 80 | 450 | 拆到 ≤300 | `apps/desktop/src/renderer/features/project-management-epc/epcWork5PaymentReportUtils.ts` | 按单一职责抽纯函数/子模块，原路径 re-export。 |
| 81 | 449 | 拆到 ≤300 | `packages/model-gateway/src/providers/openai.ts` | 按单一职责抽纯函数/子模块，原路径 re-export。 |
| 82 | 446 | 拆到 ≤300 | `apps/desktop/src/main/services/document-ocr.service.ts` | 按职责拆子模块，本文件做门面并保持导出。 |
| 83 | 442 | 拆到 ≤300 | `apps/desktop/src/renderer/features/project-manager/useProjectManagerPage.ts` | 抽纯函数或 1 个子 hook，原 hook 同名导出。 |
| 84 | 433 | 拆到 ≤300 | `apps/desktop/src/renderer/features/project-management-epc/epcWork2ShippingCiReportUtils.ts` | 按单一职责抽纯函数/子模块，原路径 re-export。 |
| 85 | 432 | 特殊保留 | `apps/desktop/src/renderer/components/icons/actions.tsx` | SVG 图标目录。432 行。若必须压到 300，可按 chat/pm/nav 拆，收益低。 |
| 86 | 419 | 拆到 ≤300 | `apps/desktop/src/main/services/project-management/pm-plan-apply.service.ts` | 按职责拆子模块，本文件做门面并保持导出。 |
| 87 | 409 | 拆到 ≤300 | `apps/desktop/src/renderer/features/project-management-epc/epcWork1BoqFormatReportUtils.ts` | 按单一职责抽纯函数/子模块，原路径 re-export。 |
| 88 | 405 | 拆到 ≤300 | `apps/mobile/src/features/KnowledgeFilePanel.tsx` | 抽子组件或 StyleSheet，容器 Props 不变。 |
| 89 | 404 | 拆到 ≤300 | `apps/desktop/src/renderer/features/knowledge/useKnowledgePageDocuments.ts` | 抽纯函数或 1 个子 hook，原 hook 同名导出。 |
| 90 | 403 | 拆到 ≤300 | `apps/desktop/src/renderer/features/project-manager/views/schedule/pm-project-info-dialog-utils.ts` | 按单一职责抽纯函数/子模块，原路径 re-export。 |
| 91 | 402 | 拆到 ≤300 | `apps/mobile/src/p2p/groupChatMesh.ts` | 按单一职责抽纯函数/子模块，原路径 re-export。 |
| 92 | 396 | 拆到 ≤300 | `apps/desktop/src/renderer/features/notes/NotesEditorToolbar.tsx` | 抽子组件或 StyleSheet，容器 Props 不变。 |
| 93 | 396 | 拆到 ≤300 | `apps/desktop/src/main/services/task-runtime/chat-task-send.service.ts` | 按职责拆子模块，本文件做门面并保持导出。 |
| 94 | 391 | 拆到 ≤300 | `apps/desktop/src/main/services/agent-generation/system-hints.ts` | 按单一职责抽纯函数/子模块，原路径 re-export。 |
| 95 | 390 | 拆到 ≤300 | `apps/mobile/src/features/useKnowledgeUi.ts` | 抽纯函数或 1 个子 hook，原 hook 同名导出。 |
| 96 | 389 | 拆到 ≤300 | `apps/mobile/src/features/KnowledgePanes.tsx` | 抽子组件或 StyleSheet，容器 Props 不变。 |
| 97 | 382 | 拆到 ≤300 | `apps/desktop/src/main/services/task-runtime/task-output-files.ts` | 按单一职责抽纯函数/子模块，原路径 re-export。 |
| 98 | 381 | 拆到 ≤300 | `apps/mobile/src/features/CommunityPanes.tsx` | 抽子组件或 StyleSheet，容器 Props 不变。 |
| 99 | 380 | 拆到 ≤300 | `apps/desktop/src/renderer/features/translation/TranslationDocumentWorkspace.tsx` | 抽子组件或 StyleSheet，容器 Props 不变。 |
| 100 | 380 | 拆到 ≤300 | `apps/desktop/src/renderer/features/project-manager/views/schedule/ProjectGanttPrintTable.tsx` | 抽子组件或 StyleSheet，容器 Props 不变。 |
| 101 | 376 | 拆到 ≤300 | `packages/shared/src/project-management/pm-cost-save-history.ts` | 按单一职责抽纯函数/子模块，原路径 re-export。 |
| 102 | 375 | 拆到 ≤300 | `apps/mobile/src/auth/authingOtp.ts` | 按单一职责抽纯函数/子模块，原路径 re-export。 |
| 103 | 372 | 拆到 ≤300 | `apps/mobile/src/storage/groupChat.ts` | 按单一职责抽纯函数/子模块，原路径 re-export。 |
| 104 | 372 | 拆到 ≤300 | `apps/desktop/src/renderer/features/translation/useTranslationRecords.ts` | 抽纯函数或 1 个子 hook，原 hook 同名导出。 |
| 105 | 370 | 拆到 ≤300 | `packages/shared/src/project-management/pm-feature-save-history.ts` | 按单一职责抽纯函数/子模块，原路径 re-export。 |
| 106 | 370 | 拆到 ≤300 | `apps/desktop/src/renderer/features/assistant-lib/hooks/useAssistantLibBootstrap.ts` | 抽纯函数或 1 个子 hook，原 hook 同名导出。 |
| 107 | 370 | 拆到 ≤300 | `apps/desktop/src/main/services/knowledge-ingest-shared.ts` | 按单一职责抽纯函数/子模块，原路径 re-export。 |
| 108 | 369 | 特殊保留 | `packages/shared/src/project-management/pm-save-history.test.ts` | 内聚测试套件，已 ≤600。 |
| 109 | 369 | 拆到 ≤300 | `packages/shared/src/p2p/share-projection.ts` | 按单一职责抽纯函数/子模块，原路径 re-export。 |
| 110 | 365 | 拆到 ≤300 | `packages/shared/src/project-management/pm-resource-save-history.ts` | 按单一职责抽纯函数/子模块，原路径 re-export。 |
| 111 | 364 | 拆到 ≤300 | `apps/desktop/src/renderer/features/project-management-epc/epcCommercialWorkflowStepReportUtils.ts` | 按单一职责抽纯函数/子模块，原路径 re-export。 |
| 112 | 362 | 拆到 ≤300 | `apps/mobile/src/p2p/mailboxSync.ts` | 按单一职责抽纯函数/子模块，原路径 re-export。 |
| 113 | 362 | 特殊保留 | `apps/desktop/src/renderer/features/project-manager/views/schedule/pm-gantt-cost-assignment.test.ts` | 内聚测试套件，已 ≤600。 |
| 114 | 361 | 拆到 ≤300 | `apps/desktop/src/renderer/features/translation/TranslationDocumentPageRow.tsx` | 抽子组件或 StyleSheet，容器 Props 不变。 |
| 115 | 360 | 拆到 ≤300 | `apps/desktop/src/renderer/features/project-manager/views/settings/ProjectManagementSettingsPanel.tsx` | 抽子组件或 StyleSheet，容器 Props 不变。 |
| 116 | 359 | 拆到 ≤300 | `apps/mobile/src/features/ClassroomRecordsPane.tsx` | 抽子组件或 StyleSheet，容器 Props 不变。 |
| 117 | 358 | 拆到 ≤300 | `apps/mobile/src/features/projectStats.ts` | 按单一职责抽纯函数/子模块，原路径 re-export。 |
| 118 | 358 | 拆到 ≤300 | `apps/mobile/src/features/SwipeableTopicRow.tsx` | 抽子组件或 StyleSheet，容器 Props 不变。 |
| 119 | 357 | 拆到 ≤300 | `packages/model-gateway/src/providers/anthropic.ts` | 按单一职责抽纯函数/子模块，原路径 re-export。 |
| 120 | 356 | 拆到 ≤300 | `apps/desktop/src/main/services/task-runtime/reflection/reflection.service.ts` | 按职责拆子模块，本文件做门面并保持导出。 |
| 121 | 354 | 拆到 ≤300 | `packages/shared/src/project-management/pm-cost-catalog-agent.ts` | 按单一职责抽纯函数/子模块，原路径 re-export。 |
| 122 | 349 | 拆到 ≤300 | `apps/mobile/src/features/settingsModalFields.tsx` | 抽子组件或 StyleSheet，容器 Props 不变。 |
| 123 | 348 | 拆到 ≤300 | `apps/desktop/src/renderer/features/project-management-epc/epcCommercialMessage.ts` | 按单一职责抽纯函数/子模块，原路径 re-export。 |
| 124 | 348 | 拆到 ≤300 | `apps/desktop/src/main/services/task-runtime/executor/executor.service.ts` | 按职责拆子模块，本文件做门面并保持导出。 |
| 125 | 345 | 拆到 ≤300 | `apps/desktop/src/renderer/features/project-manager/views/cost/ProjectCostTableBody.tsx` | 抽子组件或 StyleSheet，容器 Props 不变。 |
| 126 | 342 | 拆到 ≤300 | `packages/shared/src/project-management/pm-resource-catalog-agent.ts` | 按单一职责抽纯函数/子模块，原路径 re-export。 |
| 127 | 341 | 拆到 ≤300 | `apps/desktop/src/renderer/features/translation/TranslationSidebar.tsx` | 抽子组件或 StyleSheet，容器 Props 不变。 |
| 128 | 338 | 拆到 ≤300 | `apps/mobile/src/features/KnowledgeCreateModal.tsx` | 抽子组件或 StyleSheet，容器 Props 不变。 |
| 129 | 334 | 拆到 ≤300 | `apps/mobile/src/features/useCommunityPublishModals.ts` | 抽纯函数或 1 个子 hook，原 hook 同名导出。 |
| 130 | 334 | 拆到 ≤300 | `apps/desktop/src/renderer/features/project-manager/views/schedule/ProjectGanttTaskGridHeader.tsx` | 抽子组件或 StyleSheet，容器 Props 不变。 |
| 131 | 334 | 拆到 ≤300 | `apps/desktop/src/renderer/features/project-manager/pm-api.ts` | 按单一职责抽纯函数/子模块，原路径 re-export。 |
| 132 | 333 | 拆到 ≤300 | `apps/mobile/src/features/GroupResourcePickerModal.tsx` | 抽子组件或 StyleSheet，容器 Props 不变。 |
| 133 | 333 | 拆到 ≤300 | `apps/desktop/src/renderer/features/project-manager/ProjectManagementAgentPanel.tsx` | 抽子组件或 StyleSheet，容器 Props 不变。 |
| 134 | 332 | 特殊保留 | `apps/mobile/src/icons/composer-icons.tsx` | 移动端作曲栏 SVG。332 行。 |
| 135 | 328 | 拆到 ≤300 | `apps/desktop/src/renderer/features/project-manager/views/cost/ProjectCostMenuBar.tsx` | 抽子组件或 StyleSheet，容器 Props 不变。 |
| 136 | 328 | 拆到 ≤300 | `apps/desktop/src/main/services/task-runtime/store.ts` | 按单一职责抽纯函数/子模块，原路径 re-export。 |
| 137 | 327 | 拆到 ≤300 | `apps/desktop/src/renderer/features/project-manager/views/schedule/ProjectInfoDialogAdvancedTab.tsx` | 抽子组件或 StyleSheet，容器 Props 不变。 |
| 138 | 327 | 拆到 ≤300 | `apps/desktop/src/main/services/project-management/pm-runtime-snapshot.service.ts` | 按职责拆子模块，本文件做门面并保持导出。 |
| 139 | 325 | 特殊保留 | `apps/desktop/src/renderer/features/project-manager/views/schedule/pm-gantt-prefs.test.ts` | 内聚测试套件，已 ≤600。 |
| 140 | 325 | 拆到 ≤300 | `apps/desktop/src/renderer/features/chat/MessageMarkdown.tsx` | 抽子组件或 StyleSheet，容器 Props 不变。 |
| 141 | 324 | 拆到 ≤300 | `packages/knowledge/src/parsers/odl-anomaly-interceptor.ts` | 按单一职责抽纯函数/子模块，原路径 re-export。 |
| 142 | 324 | 拆到 ≤300 | `apps/desktop/src/main/services/p2p/p2p-member-shared.ts` | 按单一职责抽纯函数/子模块，原路径 re-export。 |
| 143 | 324 | 拆到 ≤300 | `apps/desktop/src/main/services/epc-commercial/EpcCommercialService.ts` | 按职责拆子模块，本文件做门面并保持导出。 |
| 144 | 323 | 拆到 ≤300 | `apps/desktop/src/renderer/features/settings/useProviderConfigPanel.ts` | 抽纯函数或 1 个子 hook，原 hook 同名导出。 |
| 145 | 323 | 拆到 ≤300 | `apps/desktop/src/renderer/features/project-manager/ProjectResourcePlanApplyBar.tsx` | 抽子组件或 StyleSheet，容器 Props 不变。 |
| 146 | 321 | 拆到 ≤300 | `apps/mobile/src/settings/prefs.ts` | 按单一职责抽纯函数/子模块，原路径 re-export。 |
| 147 | 321 | 拆到 ≤300 | `apps/desktop/src/main/services/epc-commercial/safeWriteProgressCiInvoiceWrite.ts` | 按单一职责抽纯函数/子模块，原路径 re-export。 |
| 148 | 319 | 拆到 ≤300 | `packages/db/src/repositories/agent-task.repository.ts` | 按单一职责抽纯函数/子模块，原路径 re-export。 |
| 149 | 318 | 拆到 ≤300 | `apps/desktop/src/renderer/features/assistant-lib/hooks/useAssistantLibPage.ts` | 抽纯函数或 1 个子 hook，原 hook 同名导出。 |
| 150 | 318 | 拆到 ≤300 | `apps/desktop/src/main/services/assistant-lib-syllabus.service.ts` | 按职责拆子模块，本文件做门面并保持导出。 |
| 151 | 315 | 拆到 ≤300 | `apps/desktop/src/renderer/features/chat/useMessageInput.ts` | 抽纯函数或 1 个子 hook，原 hook 同名导出。 |
| 152 | 310 | 拆到 ≤300 | `apps/desktop/src/renderer/features/notes/notes-storage.ts` | 按单一职责抽纯函数/子模块，原路径 re-export。 |
| 153 | 309 | 拆到 ≤300 | `apps/desktop/src/renderer/features/project-manager/views/cost/ProjectCostTableSummaryRow.tsx` | 抽子组件或 StyleSheet，容器 Props 不变。 |
| 154 | 304 | 拆到 ≤300 | `apps/desktop/src/renderer/features/settings/SettingsPanelContent.tsx` | 抽子组件或 StyleSheet，容器 Props 不变。 |
| 155 | 304 | 拆到 ≤300 | `apps/desktop/src/renderer/features/project-manager/views/files/pm-features-panel-utils.ts` | 按单一职责抽纯函数/子模块，原路径 re-export。 |
| 156 | 303 | 拆到 ≤300 | `apps/desktop/src/renderer/features/project-manager/views/time/ProjectTimeEntryPanel.tsx` | 抽子组件或 StyleSheet，容器 Props 不变。 |
| 157 | 302 | 拆到 ≤300 | `apps/desktop/src/renderer/features/project-manager/views/schedule/ProjectScheduleGanttPanel.tsx` | 抽子组件或 StyleSheet，容器 Props 不变。 |
| 158 | 301 | 拆到 ≤300 | `apps/desktop/src/renderer/features/chat/useChatSendOperations.ts` | 抽纯函数或 1 个子 hook，原 hook 同名导出。 |

## 验收

- 原文件路径的导出符号不变（可用 `export * from` 做门面）。
- `pnpm typecheck` 通过。
- 不改 IPC 通道字符串、不改组件 Props 名。
- 桌面 `pnpm dev:p2p:a` 若改了 main，需重启。

