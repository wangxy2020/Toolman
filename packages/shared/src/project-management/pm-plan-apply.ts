import {
  DEFAULT_PM_PROJECT_CODE_PREFIX,
  DEFAULT_PM_PROJECT_NAME_PREFIX,
  PmScheduleSuggestionSchema,
  type PmProjectPlan,
  type PmScheduleSuggestion,
  type PmWbsSuggestion,
} from './pm-plan-schemas.js'
import { parsePmFullPlanFromText, splitMarkdownRow } from './pm-plan-parse.js'

export * from './pm-plan-schemas.js'
export * from './pm-plan-parse.js'
export * from './pm-plan-present.js'

export function parsePmWbsSuggestionsFromText(text: string): PmWbsSuggestion[] {
  return parsePmFullPlanFromText(text).wbs
}

export function parsePmProjectPlanFromText(text: string): PmProjectPlan | undefined {
  return parsePmFullPlanFromText(text).projectPlan
}

export function parsePmScheduleSuggestionsFromText(text: string): PmScheduleSuggestion[] {
  const rows = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.includes('|'))

  const looksLikeDate = (value: string): boolean =>
    /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(value.trim())

  const suggestions: PmScheduleSuggestion[] = []
  for (const row of rows) {
    if (/^[-:| ]+$/.test(row)) continue
    const cells = splitMarkdownRow(row)
    if (cells.length < 3) continue
    if (/workItemTitle|任务|标题/i.test(cells[0] ?? '')) continue
    // Resource/cost tables share a pipe layout; require date-like cells for schedule rows.
    if (!looksLikeDate(cells[1] ?? '') || !looksLikeDate(cells[2] ?? '')) continue

    const result = PmScheduleSuggestionSchema.safeParse({
      workItemTitle: cells[0],
      suggestedStartDate: cells[1],
      suggestedDueDate: cells[2],
      reason: cells[3],
    })
    if (result.success) suggestions.push(result.data)
  }

  return suggestions
}

function parseDateToMs(value: string | undefined): number | undefined {
  if (!value?.trim()) return undefined
  const parsed = Date.parse(value.trim())
  return Number.isFinite(parsed) ? parsed : undefined
}

export function parsePmWbsDateToMs(value: string | undefined): number | undefined {
  return parseDateToMs(value)
}

export function parsePmScheduleDateToMs(value: string): number | undefined {
  return parseDateToMs(value)
}

/** Merge schedule table dates into WBS suggestions by title (case-insensitive). */
export function mergePmScheduleIntoWbsSuggestions(
  wbs: PmWbsSuggestion[],
  schedule: PmScheduleSuggestion[],
): PmWbsSuggestion[] {
  if (schedule.length === 0) return wbs
  const byTitle = new Map(
    schedule.map((entry) => [entry.workItemTitle.trim().toLowerCase(), entry] as const),
  )
  return wbs.map((item) => {
    const match = byTitle.get(item.title.trim().toLowerCase())
    if (!match) return item
    return {
      ...item,
      startDate: item.startDate ?? match.suggestedStartDate,
      dueDate: item.dueDate ?? match.suggestedDueDate,
    }
  })
}

/**
 * Derive start/due ms from explicit dates, falling back to durationDays from start
 * (or due − duration when only due is present).
 */
export function resolvePmWbsSuggestionDates(suggestion: PmWbsSuggestion): {
  startDate?: number
  dueDate?: number
} {
  const startDate = parseDateToMs(suggestion.startDate)
  const dueDate = parseDateToMs(suggestion.dueDate)
  if (startDate != null && dueDate != null) {
    return { startDate, dueDate }
  }
  const duration = suggestion.durationDays
  if (duration != null && duration > 0) {
    const dayMs = 24 * 60 * 60 * 1000
    if (startDate != null) {
      return { startDate, dueDate: startDate + (duration - 1) * dayMs }
    }
    if (dueDate != null) {
      return { startDate: dueDate - (duration - 1) * dayMs, dueDate }
    }
  }
  return { startDate, dueDate }
}

export function nextDefaultPmProjectName(
  existingNames: string[],
  prefix = DEFAULT_PM_PROJECT_NAME_PREFIX,
): string {
  let max = 0
  const pattern = new RegExp(`^${escapeRegExp(prefix)}(\\d+)$`)
  for (const name of existingNames) {
    const match = name.trim().match(pattern)
    if (!match) continue
    const value = Number.parseInt(match[1] ?? '', 10)
    if (Number.isFinite(value)) max = Math.max(max, value)
  }
  return `${prefix}${max + 1}`
}

/**
 * Next project code in EPC style: `PRJ-YYSS` (4 digits after prefix).
 * YY = current year % 100, SS = next sequence for that year.
 */
export function nextDefaultPmProjectCode(
  existingCodes: string[],
  prefix = DEFAULT_PM_PROJECT_CODE_PREFIX,
  now: Date = new Date(),
): string {
  const year = now.getFullYear() % 100
  const yearToken = String(year).padStart(2, '0')
  const pattern = new RegExp(`^${escapeRegExp(prefix)}(\\d{4})$`)
  let maxSeq = 0
  for (const code of existingCodes) {
    const match = code.trim().match(pattern)
    if (!match?.[1]) continue
    const digits = match[1]
    if (digits.slice(0, 2) !== yearToken) continue
    const seq = Number.parseInt(digits.slice(2, 4), 10)
    if (Number.isFinite(seq)) maxSeq = Math.max(maxSeq, seq)
  }
  const nextSeq = Math.min(maxSeq + 1, 99)
  return `${prefix}${yearToken}${String(nextSeq).padStart(2, '0')}`
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Build the agent kickoff message from a saved PM project (create dialog). */
export function buildPmNewProjectBriefMessageFromProject(project: {
  code: string
  name: string
  description?: string | null
  metadata?: Record<string, unknown>
}): string {
  const metadata = project.metadata ?? {}
  const read = (key: string): string => {
    const value = metadata[key]
    return typeof value === 'string' ? value.trim() : value != null ? String(value).trim() : ''
  }
  const planStart = read('planStartDate')
  const planFinish = read('planFinishDate')
  let durationDays: number | undefined
  if (planStart && planFinish) {
    const start = Date.parse(`${planStart}T00:00:00`)
    const finish = Date.parse(`${planFinish}T00:00:00`)
    if (Number.isFinite(start) && Number.isFinite(finish) && finish >= start) {
      durationDays = Math.round((finish - start) / 86_400_000) + 1
    }
  }
  const overview =
    (project.description ?? '').trim() ||
    '（用户未填写说明，请根据项目名称与计划字段合理推断范围与 WBS）'

  return buildPmNewProjectBriefMessage({
    name: project.name,
    overview,
    durationDays,
    code: project.code,
    planStart: planStart || undefined,
    planFinish: planFinish || undefined,
    planPhase: read('planPhase') || undefined,
    period: read('period') || undefined,
    region: read('region') || undefined,
  })
}

export function buildPmNewProjectBriefMessage(input: {
  name: string
  overview: string
  durationDays?: number
  code?: string
  planStart?: string
  planFinish?: string
  planPhase?: string
  period?: string
  region?: string
}): string {
  const today = new Date().toISOString().slice(0, 10)
  const durationLine =
    input.durationDays != null && input.durationDays > 0
      ? String(input.durationDays)
      : '（未指定，请从概况推断总日历天与起止）'
  const extraLines = [
    input.code?.trim() ? `- 编号：${input.code.trim()}` : null,
    input.planStart?.trim() ? `- 计划开始：${input.planStart.trim()}` : null,
    input.planFinish?.trim() ? `- 计划完成：${input.planFinish.trim()}` : null,
    input.planPhase?.trim() ? `- 计划阶段：${input.planPhase.trim()}` : null,
    input.period?.trim() ? `- 计划工期：${input.period.trim()}` : null,
    input.region?.trim() ? `- 区域：${input.region.trim()}` : null,
  ].filter(Boolean)

  return `请根据以下新建项目简报，生成完整可解析的甘特计划（层级 WBS + 排期 + 前置关系）。

## 项目简报
- 名称：${input.name}
- 概况：${input.overview}
- 工期总日历天：${durationLine}${extraLines.length > 0 ? `\n${extraLines.join('\n')}` : ''}

## 输出要求
请严格按以下四段 Markdown 输出（**不要输出 JSON / 代码块**；系统会直接从任务表解析并写入甘特）：

### 一、任务表（WBS层级）
用 Markdown 表，列固定为：
| 层级 | 任务名称 | 工期(天) | 开始日期 | 完成日期 | 前置任务 |
规则：
- 第 1 行必须是**当前项目名称**（层级 1，如 PRJ 编号 · 项目名），工期/起止为项目总工期；不要把说明文字写入任务名称。
- 其余任务全部挂在其下，按深度优先排列（父项后紧跟全部子项）：1.1、1.1.1、1.1.2、1.2…
- 前置任务列只用**层级编号**写逻辑关系，如 \`1.1FS\`、\`1.2SS+5\`；多个前置用逗号或分号分隔；无前置写 —。
- 汇总行（有子项）前置列写 —；逻辑关系只写在叶子任务上。
- 汇总行起止日期必须包络全部子项；若简报未指定开始日期，建议开始不得早于 ${today}。
- 叶子任务前置须连通：除最早开始的叶子外，每个叶子都要有 predecessors，从开工能到达竣工。

### 二、计划合规性说明
用短列表说明：总工期是否满足、层级是否齐全、前置网络是否连通、有无并行/汇聚约定。不要重复粘贴任务表。

### 三、关键路径说明
用短表或条目标出关键路径主要段落及合计日历天。

### 四、调度说明（或后续建议）
补充平行路径、汇聚节点、风险与下一步建议（3–6 条以内）。

项目已在系统中创建，勿要求用户再次填写项目名称；除上述四段外不要写冗长散文。`
}

/** True when suggestions need hierarchical / relation-aware apply. */
export function pmWbsSuggestionsNeedTreeApply(suggestions: PmWbsSuggestion[]): boolean {
  return suggestions.some(
    (item) =>
      Boolean(item.parentTitle?.trim()) ||
      (item.predecessors != null && item.predecessors.length > 0) ||
      item.durationDays != null,
  )
}
