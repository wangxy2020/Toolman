import {
  EPC_COMMERCIAL_AGENT_NARRATION_MARKER,
  EPC_COMMERCIAL_REPORT_TITLE,
  EPC_COMMERCIAL_WORKFLOW_STEPS,
  type IpcAlignmentReport,
} from '@toolman/shared'
import {
  EPC_STEP1_SCAN_INTRO,
  EPC_STEP2_INTRO,
  EPC_STEP3_PURPOSE,
  EPC_STEP4_PURPOSE,
  formatDiscoveredTablesMarkdown,
  formatStep1FooterLine,
  formatWork4NarrationHints,
  formatWorkflowStepsMarkdown,
  isStep1ScanSuccess,
  work4RequiresDiagnosticAnalysis,
} from './epcCommercialReportUtils'

const formatSteps2to5Section = (report: IpcAlignmentReport, workflowError?: string): string =>
  formatWorkflowStepsMarkdown(report, workflowError).join('\n')

const formatStep1Section = (report: IpcAlignmentReport, workflowError?: string): string => {
  const tableLines = formatDiscoveredTablesMarkdown(report.discoveredFiles)
  const footer = formatStep1FooterLine(report.discoveredFiles, workflowError)

  const lines = ['### 步骤 1：多层穿透与匹配', '', EPC_STEP1_SCAN_INTRO, '']

  if (isStep1ScanSuccess(report.discoveredFiles)) {
    lines.push(...tableLines, '', footer)
  } else {
    lines.push(footer)
  }

  return lines.join('\n')
}

const formatReportStepsMarkdown = (report: IpcAlignmentReport, workflowError?: string): string => {
  const hintLines = formatWork4NarrationHints(report, workflowError)
  return [
    `# ${EPC_COMMERCIAL_REPORT_TITLE}`,
    '',
    formatStep1Section(report, workflowError),
    '',
    formatSteps2to5Section(report, workflowError),
    ...(hintLines.length > 0 ? ['', ...hintLines] : [])
  ].join('\n')
}

const buildWork4DiagnosticInstructions = (report?: IpcAlignmentReport, errorMessage?: string): string => {
  const needsDiagnostic = report
    ? work4RequiresDiagnosticAnalysis(report, errorMessage)
    : Boolean(errorMessage?.trim())

  if (!needsDiagnostic) {
    return `**诊断分析与人工修复建议**：
- **不要输出**该章节（本次各步成功，或步骤 1 待处理为 0 导致步骤 2～5 正常跳过）。
- 勿凭空编造清洗、合并或校验问题。`
  }

  return `**诊断分析与人工修复建议**（须在报告末尾单独成章）：
- 仅在有步骤 **失败** 或引擎报错时输出；逐步成功（含「无待处理、已跳过」）时勿写本章。
- 解释 Item 对应不上的可能原因（编号格式差异等）。
- 建议如何修改原始 IPC 文件（如 1.2a 改为 1.2A）。
- 列出清洗遗漏行的具体原因（数量×单价、格式等）。
- 你不直接修改文件，也不生成/写入新的 CSV；只输出人工可操作的建议。`
}

/** 传给智能体 API 的本地执行上下文（用户气泡中不展示） */
export const buildEpcCommercialAgentContextContent = (params: {
  workspaceRoot: string
  visibleUserRequest: string
  report?: IpcAlignmentReport
  errorMessage?: string
  placeholderHint?: string
}): string => {
  let engineSection = ''
  if (params.placeholderHint) {
    engineSection = params.placeholderHint
  } else if (params.report) {
    engineSection = formatReportStepsMarkdown(params.report, params.errorMessage)
  } else if (params.errorMessage) {
    engineSection = `执行失败：${params.errorMessage}`
  } else {
    engineSection = '（无执行结果）'
  }

  return `${EPC_COMMERCIAL_AGENT_NARRATION_MARKER}

你是成本智能体。用户已发起「进度款工程量数据统计」；本地 Rust 引擎已执行完毕。

**回复格式要求**：
- 正文标题：\`# ${EPC_COMMERCIAL_REPORT_TITLE}\`。
- 按五条业务线顺序汇报：${EPC_COMMERCIAL_WORKFLOW_STEPS.map((s, i) => `${i + 1}. ${s}`).join('；')}。
- **步骤 1**：先写引导句「${EPC_STEP1_SCAN_INTRO}」，**原样输出**引擎给出的 HTML 穿透表（\`class="epc-discovery-table"\`，三列：文件名 / 分类 / 说明；说明列：无需处理=上一次处理日期，已处理=处理完成时间；**勿**改成纯 Markdown 表或调整列宽），表格下方写「**成功。**」或「**失败。**」+ 统计（勿写「状态：」前缀）。
- **步骤 2～5**：必须**分五条**汇报（「### 步骤 2：工程量清单分析」…「### 步骤 5：…」），每步先写一步说明段落，再写粗体「**成功。**」或「**失败。**」+ 该步详情；**禁止**在任一步失败时写「成功」。
- 若执行结果标明「待处理为 0、步骤 2～5 已跳过」，这些步骤须写 **成功。** 并说明无需处理，**不得**写成失败。
- 若执行结果含「诊断说明：本次无需输出」，**不要**写「诊断分析与人工修复建议」章节。
- **步骤 2～4**：每步先一行汇总（如「2 个文件完成表内校验」），再列要点（• 文件名：…），**勿**重复长段说明或逐条展开全部金额。
- **步骤 2**：引导句「${EPC_STEP2_INTRO}」；要点格式「• {fileName}：{cleanedRowCount} 行，无行级错误」。
- **步骤 3**：${EPC_STEP3_PURPOSE} 要点「• {fileName}：与 BOQ Value 一致/不一致」。
- **步骤 4**：${EPC_STEP4_PURPOSE} 成功时「• {fileName}：{mergeTargetSheet} · 列 {mergePeriodColumn} · N 行」；\`mergeOk\` 为 false 则失败。
- **步骤 5**：存在 \`failedCount > 0\` 时必须失败；**成功**时先写「**成功。**」，下一行起逐条列出输出母表完整路径（每行 \`- \`完整路径\`\`，勿另写文件名），**空一行**后单独写成功/跳过统计（如「成功 **4** · 跳过 **7**」），**勿**把统计粘在最后一个路径行后面；路径须与「本地 Rust 引擎执行结果」中步骤 5 一致。

${buildWork4DiagnosticInstructions(params.report, params.errorMessage)}

**禁止**：调用 Bash/Shell、运行 python3 或其它脚本、Write/Edit 文件、重新 Glob/Read 扫描工作区。若引擎报错：开发环境请用 pnpm dev 启动；生产环境将 license.key 放到用户数据目录/epc-commercial/。

## 用户请求
${params.visibleUserRequest}

## 工作区根目录
${params.workspaceRoot}

## 本地 Rust 引擎执行结果
${engineSection}`
}
