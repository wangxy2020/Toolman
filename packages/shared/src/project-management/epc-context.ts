import {
  PROJECT_MANAGEMENT_AGENT_SESSION_TITLES,
  type ProjectManagementAgentTab,
} from './agent-link.js'
import { buildEpcPortfolioAggregates } from './epc-aggregates.js'
import { MOCK_EPC_PROJECTS, formatProjectMoney, type EpcProjectRecord } from './epc-mock.js'
import {
  buildPmAgentPortfolioSummary,
  type PmAgentSnapshot,
} from './pm-agent-snapshot.js'
import { PM_RESOURCE_PLAN_OUTPUT_HINT } from './pm-resource-apply.js'
import { PM_RESOURCE_CATALOG_PATCH_OUTPUT_HINT } from './pm-resource-catalog-agent.js'

function formatEpcStatus(status: EpcProjectRecord['status']): string {
  switch (status) {
    case 'critical':
      return '高风险'
    case 'warning':
      return '需关注'
    default:
      return '正常'
  }
}

export function buildEpcPortfolioSummary(tab: ProjectManagementAgentTab): string {
  const aggregates = buildEpcPortfolioAggregates()
  const summaryLines = [
    `- 在管项目：${aggregates.projectCount} 个`,
    `- 合同总额：${formatProjectMoney(aggregates.contractTotal)}（USD 口径 · MOCK）`,
    `- 已结算：${formatProjectMoney(aggregates.settledTotal)}（结算率 ${aggregates.settlementRate}%）`,
    `- 待支付：${formatProjectMoney(aggregates.pendingTotal)}`,
    `- 平均进度：${aggregates.avgProgress.toFixed(1)}%`,
    `- 风险/需关注项目：${aggregates.overdueCount} 个`,
  ]

  const projectLines = MOCK_EPC_PROJECTS.map((project) => {
    if (tab === 'cost_management') {
      return [
        `- ${project.code} ${project.name}`,
        `  合同 ${formatProjectMoney(project.contractValue)} · 已结算 ${formatProjectMoney(project.settledAmount)} · 待支付 ${formatProjectMoney(project.pendingAmount)} · ${formatEpcStatus(project.status)}`,
      ].join('\n')
    }

    return [
      `- ${project.code} ${project.name}`,
      `  进度 ${project.progressPercent}% · 阶段 ${project.planPhase} · 周期 ${project.period} · ${formatEpcStatus(project.status)}`,
    ].join('\n')
  })

  return ['### 组合汇总', ...summaryLines, '', '### 项目明细', ...projectLines].join('\n')
}

export function buildProjectManagementAssistantSystemPrompt(): string {
  return [
    '你是 Toolman 项目管理模块的 EPC 专业智能体，服务于工程总承包（EPC）项目的计划与成本管理。',
    '',
    '能力范围：',
    '- 解读成本看板：合同额、结算、待支付、偏差与风险项目',
    '- 解读计划看板：进度、里程碑、计划阶段与滞后预警',
    '- 协助 IPC 对齐、付款申请与进度汇报相关的分析与文档',
    '- 使用 Excel MCP 处理成本/进度表格，使用 DOCX MCP 审阅合同与报告',
    '',
    '工作原则：',
    '- 使用清晰中文；金额注明口径（当前看板为 USD 演示数据）',
    '- 优先依据系统注入的最新项目快照作答；缺少实时 EPC 引擎数据时明确说明',
    '- 涉及文件操作时在工作目录内创建或修改，并给出绝对路径',
  ].join('\n')
}

export function buildProjectManagementRuntimeHint(
  tab: ProjectManagementAgentTab,
  snapshot?: PmAgentSnapshot | null,
): string {
  const sessionTitle = PROJECT_MANAGEMENT_AGENT_SESSION_TITLES[tab]
  const portfolioSummary = snapshot
    ? buildPmAgentPortfolioSummary(snapshot)
    : buildEpcPortfolioSummary(tab)
  const dataSourceNote = snapshot
    ? '下方为 Toolman 工作区 SQLite 中的项目与工作项快照。'
    : '下方为 Toolman 成本/计划看板演示快照（MOCK 数据）。'

  if (tab === 'cost_management') {
    return [
      '## 项目管理（EPC）工作上下文',
      `当前话题：${sessionTitle}。优先围绕 合同、结算、待支付、成本偏差与付款节奏 作答。`,
      dataSourceNote,
      portfolioSummary,
      '若用户上传 Excel/Word 或要求生成报表，可使用已启用的 MCP 工具处理工作目录中的项目文件。',
    ].join('\n\n')
  }

  if (tab === 'progress_management') {
    return [
      '## 项目管理（EPC）工作上下文',
      `当前话题：${sessionTitle}。优先围绕 进度、里程碑、计划阶段、周期、依赖关系、滞后风险与任务资源用量 作答。`,
      dataSourceNote,
      portfolioSummary,
      PM_RESOURCE_PLAN_OUTPUT_HINT,
      PM_RESOURCE_CATALOG_PATCH_OUTPUT_HINT,
      '若用户上传 Excel/Word 或要求生成报表，可使用已启用的 MCP 工具处理工作目录中的项目文件。',
    ].join('\n\n')
  }

  if (tab === 'resource_management') {
    return [
      '## 项目管理工作上下文',
      `当前话题：${sessionTitle}。优先围绕资源列表字段（类型、名称、规格、单位、单价、说明）的维护、查重、补全与跨列表对比作答。`,
      '可查询、分析并修改：系统默认列表（全部项目、EMP-2401、PRJ-2601）以及用户自建项目资源列表。',
      '任务×用量写入甘特资源列由「计划管理」会话确认；本会话侧重资源字典维护。',
      '## 资源数据使用规则（必读）',
      '1. 资源列表已在下方系统注入（见「### 全部项目适用的资源列表」与「### 项目资源列表」）。这就是权威数据源。',
      '2. **禁止**声称缺少资源数据而去工作目录搜索 Excel/文档，除非用户明确上传了附件或要求读取某文件。',
      '3. **禁止**要求用户粘贴列表或提供 SQLite 路径；若注入区块已出现资源条目，直接基于其分析。',
      '4. 工作目录工具仅用于用户另行指定的文件任务，与资源字典检查无关。',
      dataSourceNote,
      portfolioSummary,
      PM_RESOURCE_CATALOG_PATCH_OUTPUT_HINT,
    ].join('\n\n')
  }

  const focusByTab: Partial<Record<ProjectManagementAgentTab, string>> = {
    all_projects: '跨项目工作台总览、重点项目状态与快捷跟进',
    urgent_tasks: '待办、预警、逾期与高优先级事项的梳理与推进',
    key_projects: '重点项目组合管理与综合协调',
    security_management: '安全质量检查、隐患整改与验收闭环',
    quality_management: '测量试验记录、检测数据与质量验收',
    archive_management: '项目档案归档、检索与交付文档管理',
    technical_management: '技术方案、设计变更与技术评审闭环',
    contract_risk_management: '合同履约、索赔与合约风险管控',
    operations_management: '运营运维、SLA 与日常运营事项推进',
  }

  const focus = focusByTab[tab] ?? '当前项目管理分栏的业务目标与执行事项'

  return [
    '## 项目管理工作上下文',
    `当前话题：${sessionTitle}。优先围绕 ${focus} 作答。`,
    dataSourceNote,
    portfolioSummary,
    '可结合工作区中的项目数据库、工作项与文件协助用户整理计划、任务与文档。',
    '涉及表格或报告时，可使用已启用的 Excel / DOCX MCP 工具处理工作目录文件。',
  ].join('\n\n')
}
