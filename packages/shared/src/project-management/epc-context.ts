import {
  PROJECT_MANAGEMENT_AGENT_SESSION_TITLES,
  type ProjectManagementAgentTab,
} from './agent-link.js'
import { buildEpcPortfolioAggregates } from './epc-aggregates.js'
import { MOCK_EPC_PROJECTS, formatProjectMoney, type EpcProjectRecord } from './epc-mock.js'

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

export function buildProjectManagementRuntimeHint(tab: ProjectManagementAgentTab): string {
  const sessionTitle = PROJECT_MANAGEMENT_AGENT_SESSION_TITLES[tab]
  const focus =
    tab === 'cost_management'
      ? '合同、结算、待支付、成本偏差与付款节奏'
      : '进度、里程碑、计划阶段、周期与滞后风险'

  return [
    '## 项目管理（EPC）工作上下文',
    `当前话题：${sessionTitle}。优先围绕 ${focus} 作答。`,
    '下方为 Toolman 成本/计划看板当前快照（MOCK 演示数据；正式 EPC 引擎接入后会替换为实时数据）。',
    buildEpcPortfolioSummary(tab),
    '若用户上传 Excel/Word 或要求生成报表，可使用已启用的 MCP 工具处理工作目录中的项目文件。',
  ].join('\n\n')
}
