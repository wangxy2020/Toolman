import { z } from 'zod'

import { PmWorkItemRelationTypeSchema } from './pm-schedule-types.js'
import {
  PmWorkItemPrioritySchema,
  PmWorkItemTypeSchema,
} from './pm-types.js'
import { presentPmResourcePlanMarkdownForDisplay } from './pm-resource-apply.js'

export const DEFAULT_PM_PROJECT_NAME_PREFIX = 'Toolman项目'
export const DEFAULT_PM_PROJECT_CODE_PREFIX = 'PRJ-'

export const PmWbsPredecessorSchema = z.object({
  title: z.string().min(1),
  type: PmWorkItemRelationTypeSchema.optional(),
  lagDays: z.number().int().optional(),
})

export type PmWbsPredecessor = z.infer<typeof PmWbsPredecessorSchema>

export const PmWbsSuggestionSchema = z.object({
  title: z.string().min(1),
  type: PmWorkItemTypeSchema.optional(),
  startDate: z.string().optional(),
  dueDate: z.string().optional(),
  priority: PmWorkItemPrioritySchema.optional(),
  parentTitle: z
    .string()
    .nullish()
    .transform((value) => {
      const trimmed = value?.trim()
      return trimmed ? trimmed : undefined
    }),
  durationDays: z.number().int().positive().optional(),
  predecessors: z.array(PmWbsPredecessorSchema).optional(),
})

export type PmWbsSuggestion = z.infer<typeof PmWbsSuggestionSchema>

export const PmScheduleSuggestionSchema = z.object({
  workItemTitle: z.string().min(1),
  suggestedStartDate: z.string().min(1),
  suggestedDueDate: z.string().min(1),
  reason: z.string().optional(),
})

export type PmScheduleSuggestion = z.infer<typeof PmScheduleSuggestionSchema>

export const PmProjectPlanSchema = z.object({
  planStart: z.string().optional(),
  planFinish: z.string().optional(),
  durationDays: z.number().int().positive().optional(),
})

export type PmProjectPlan = z.infer<typeof PmProjectPlanSchema>

export const PmApplyCreateProjectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  code: z.string().min(1).max(64).optional(),
  /** When true and a same-name project exists, clear its work items/relations and reuse it. */
  clearExisting: z.boolean().optional(),
})

export type PmApplyCreateProject = z.infer<typeof PmApplyCreateProjectSchema>

export const PmApplyWbsInputSchema = z.object({
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid().optional(),
  parentWorkItemId: z.string().uuid().optional(),
  suggestions: z.array(PmWbsSuggestionSchema).min(1),
  scheduleSuggestions: z.array(PmScheduleSuggestionSchema).optional(),
  projectPlan: PmProjectPlanSchema.optional(),
  createProject: PmApplyCreateProjectSchema.optional(),
})

export type PmApplyWbsInput = z.infer<typeof PmApplyWbsInputSchema>

export const PmApplyScheduleInputSchema = z.object({
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid(),
  suggestions: z.array(PmScheduleSuggestionSchema).min(1),
})

export type PmApplyScheduleInput = z.infer<typeof PmApplyScheduleInputSchema>

export type PmParsedPlanFromText = {
  wbs: PmWbsSuggestion[]
  projectPlan?: PmProjectPlan
}

function extractJsonCodeFence(text: string): string | null {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  return match?.[1]?.trim() ?? null
}

function extractJsonArraySnippet(text: string): string | null {
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start < 0 || end <= start) return null
  return text.slice(start, end + 1)
}

function extractJsonObjectSnippet(text: string): string | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  return text.slice(start, end + 1)
}

function parseDateToMs(value: string | undefined): number | undefined {
  if (!value?.trim()) return undefined
  const parsed = Date.parse(value.trim())
  return Number.isFinite(parsed) ? parsed : undefined
}

function parseWbsArray(parsed: unknown): PmWbsSuggestion[] {
  if (!Array.isArray(parsed)) return []
  const suggestions: PmWbsSuggestion[] = []
  for (const entry of parsed) {
    const result = PmWbsSuggestionSchema.safeParse(entry)
    if (result.success) {
      suggestions.push(result.data)
    }
  }
  return suggestions
}

function parsePlanObject(parsed: unknown): PmParsedPlanFromText | null {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const record = parsed as Record<string, unknown>
  const wbsRaw = record.wbs ?? record.items ?? record.suggestions
  const wbs = parseWbsArray(wbsRaw)
  if (wbs.length === 0) return null
  const projectPlanResult = PmProjectPlanSchema.safeParse(record.projectPlan)
  return {
    wbs,
    projectPlan: projectPlanResult.success ? projectPlanResult.data : undefined,
  }
}

export function parsePmFullPlanFromText(text: string): PmParsedPlanFromText {
  const candidates = [
    text.trim(),
    extractJsonCodeFence(text),
    extractJsonObjectSnippet(text),
    extractJsonArraySnippet(text),
  ].filter((value): value is string => Boolean(value))

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown
      if (Array.isArray(parsed)) {
        const wbs = parseWbsArray(parsed)
        if (wbs.length > 0) return { wbs }
        continue
      }
      const plan = parsePlanObject(parsed)
      if (plan) return plan
    } catch {
      // try next candidate
    }
  }

  return { wbs: [] }
}

export function parsePmWbsSuggestionsFromText(text: string): PmWbsSuggestion[] {
  return parsePmFullPlanFromText(text).wbs
}

export function parsePmProjectPlanFromText(text: string): PmProjectPlan | undefined {
  return parsePmFullPlanFromText(text).projectPlan
}

function escapeMarkdownTableCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ').trim()
}

/** Reject assistant prose / instructions that are not project titles. */
export function isPlausiblePmProjectName(name: string): boolean {
  const cleaned = name.trim()
  if (cleaned.length < 2 || cleaned.length > 80) return false
  if (/[。；！？]/.test(cleaned)) return false
  if (/如下\s*[:：]?$/.test(cleaned)) return false
  if (/[，、：:]/.test(cleaned)) return false
  if (
    /(检查|移除|调整|滞后|逻辑关系|缩短|增加|重构|补充|生成|输出|表格|如下)/.test(cleaned)
  ) {
    return false
  }
  if (
    /^(请|将|我|既然|理解|已检查|基于|现在|下面|根据|可以|需要|不要|任务|先|再|接着)/.test(
      cleaned,
    )
  ) {
    return false
  }
  return true
}

function readProjectNameFromParsed(parsed: unknown): string | undefined {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined
  const record = parsed as Record<string, unknown>
  for (const key of ['projectName', 'name', 'projectTitle'] as const) {
    const value = record[key]
    if (typeof value === 'string' && isPlausiblePmProjectName(value)) return value.trim()
  }
  const projectPlan = record.projectPlan
  if (projectPlan && typeof projectPlan === 'object' && !Array.isArray(projectPlan)) {
    const name = (projectPlan as Record<string, unknown>).name
    if (typeof name === 'string' && isPlausiblePmProjectName(name)) return name.trim()
  }
  return undefined
}

/** Infer a project title from prose around a plan JSON block. */
export function inferPmPlanProjectNameFromText(textBefore: string): string | undefined {
  const lines = textBefore
    .split('\n')
    .map((line) =>
      line
        .trim()
        .replace(/^#+\s*/, '')
        .replace(/\*\*/g, '')
        .replace(/^["「]|["」]$/g, ''),
    )
    .filter(Boolean)

  const candidates: string[] = []
  for (const line of lines) {
    if (/^```/.test(line)) continue
    if (/^(json|output|wbs)\b/i.test(line)) continue
    if (/^[{\[]/.test(line)) continue
    const cleaned = line
      .replace(/\s*[\(（]?JSON\s*Output[\)）]?\s*$/i, '')
      .replace(/\s*[:：]\s*$/, '')
      .trim()
    if (!isPlausiblePmProjectName(cleaned)) continue
    candidates.push(cleaned)
  }

  if (candidates.length === 0) return undefined

  const preferred =
    [...candidates]
      .reverse()
      .find(
        (line) =>
          /^PRJ[-_]?\w+/i.test(line) ||
          /项目\d*$/.test(line) ||
          /项目/.test(line) ||
          /施工进度计划/.test(line),
      ) ?? [...candidates].reverse().find((line) => line.length <= 40)

  if (!preferred) return undefined
  // "PRJ-2602 施工进度计划" → keep; strip trailing generic suffix noise only when code present
  const codeMatch = preferred.match(/^(PRJ[-_]?\w+)\s*[·\-—_]?\s*(.+)$/i)
  if (codeMatch?.[1] && codeMatch[2] && /进度计划|施工计划/.test(codeMatch[2])) {
    // Prefer bare project label if the rest is just "施工进度计划"
    return preferred.replace(/\s*施工进度计划.*$/, '').trim() || preferred
  }
  return preferred
}

/** Outline depth from parentTitle chain (roots = 0). Parent must appear earlier in the list. */
export function resolvePmWbsOutlineDepths(wbs: PmWbsSuggestion[]): number[] {
  const depthByTitle = new Map<string, number>()
  const seen = new Set<string>()

  return wbs.map((item) => {
    const titleKey = item.title.trim().toLowerCase()
    const parentKey = item.parentTitle?.trim().toLowerCase()
    let depth = 0
    if (parentKey && parentKey !== titleKey && seen.has(parentKey)) {
      depth = Math.min((depthByTitle.get(parentKey) ?? 0) + 1, 6)
    }
    depthByTitle.set(titleKey, depth)
    seen.add(titleKey)
    return depth
  })
}

function formatPmPredecessorRef(
  predecessor: NonNullable<PmWbsSuggestion['predecessors']>[number],
  outlineByTitle: Map<string, string>,
): string {
  const type = (predecessor.type ?? 'FS').toUpperCase()
  const lag = predecessor.lagDays ?? 0
  const lagPart = lag === 0 ? '' : lag > 0 ? `+${lag}` : String(lag)
  const outline = outlineByTitle.get(predecessor.title.trim().toLowerCase())
  const ref = outline ?? predecessor.title.trim()
  return `${ref}${type}${lagPart}`
}

function formatPmPredecessorCell(
  item: PmWbsSuggestion,
  outlineByTitle: Map<string, string>,
): string {
  const predecessors = item.predecessors
  if (!predecessors?.length) return '—'
  return predecessors
    .map((predecessor) => formatPmPredecessorRef(predecessor, outlineByTitle))
    .join('；')
}

function resolvePlanDateRange(plan: PmParsedPlanFromText): {
  startDate: string
  dueDate: string
  durationDays: number | string
} {
  const { wbs, projectPlan } = plan
  let startDate = projectPlan?.planStart?.trim() || ''
  let dueDate = projectPlan?.planFinish?.trim() || ''
  if (!startDate || !dueDate) {
    for (const item of wbs) {
      if (item.startDate && (!startDate || item.startDate < startDate)) startDate = item.startDate
      if (item.dueDate && (!dueDate || item.dueDate > dueDate)) dueDate = item.dueDate
    }
  }
  let durationDays: number | string = projectPlan?.durationDays ?? '—'
  if (
    (durationDays === '—' || durationDays == null) &&
    startDate &&
    dueDate
  ) {
    const startMs = Date.parse(`${startDate}T00:00:00`)
    const dueMs = Date.parse(`${dueDate}T00:00:00`)
    if (Number.isFinite(startMs) && Number.isFinite(dueMs) && dueMs >= startMs) {
      durationDays = Math.round((dueMs - startMs) / 86_400_000) + 1
    }
  }
  return {
    startDate: startDate || '—',
    dueDate: dueDate || '—',
    durationDays: durationDays ?? '—',
  }
}

export type FormatPmPlanTableOptions = {
  /** Display root row title (project name). */
  projectName?: string
}

/** Human-readable plan table for chat display. */
export function formatPmPlanAsMarkdownTable(
  plan: PmParsedPlanFromText,
  options?: FormatPmPlanTableOptions,
): string {
  const { wbs } = plan
  if (wbs.length === 0) return ''

  const rawName = options?.projectName?.trim() || ''
  const projectName = rawName && isPlausiblePmProjectName(rawName) ? rawName : '项目'
  const range = resolvePlanDateRange(plan)
  const depths = resolvePmWbsOutlineDepths(wbs)
  const counters: number[] = [1]
  const outlineByTitle = new Map<string, string>()
  if (projectName) {
    outlineByTitle.set(projectName.toLowerCase(), '1')
  }
  const rowOutlines: string[] = []

  for (let index = 0; index < wbs.length; index += 1) {
    const item = wbs[index]!
    // Nest everything under the synthetic project root (depth 0).
    const depth = (depths[index] ?? 0) + 1
    counters.length = depth + 1
    counters[depth] = (counters[depth] ?? 0) + 1
    for (let i = 0; i < depth; i += 1) {
      if (!counters[i]) counters[i] = 1
    }
    const outline = counters.slice(0, depth + 1).join('.')
    rowOutlines.push(outline)
    outlineByTitle.set(item.title.trim().toLowerCase(), outline)
  }

  const lines: string[] = [
    `### ${escapeMarkdownTableCell(projectName)}`,
    '',
    '| 层级 | 任务名称 | 工期(天) | 开始日期 | 完成日期 | 前置任务 |',
    '| :---: | --- | :---: | :---: | :---: | --- |',
    `| 1 | ${escapeMarkdownTableCell(projectName)} | ${range.durationDays} | ${range.startDate} | ${range.dueDate} | — |`,
  ]

  for (let index = 0; index < wbs.length; index += 1) {
    const item = wbs[index]!
    const depth = (depths[index] ?? 0) + 1
    const outline = rowOutlines[index]!
    const indent = '　'.repeat(depth)
    lines.push(
      `| ${outline} | ${indent}${escapeMarkdownTableCell(item.title)} | ${
        item.durationDays ?? '—'
      } | ${item.startDate ?? '—'} | ${item.dueDate ?? '—'} | ${escapeMarkdownTableCell(
        formatPmPredecessorCell(item, outlineByTitle),
      )} |`,
    )
  }

  return lines.join('\n')
}

/**
 * Replace WBS JSON (fenced or raw) with a readable markdown table for chat UI.
 * Also replaces resourcePlan JSON fences. Original message text is unchanged —
 * apply/parse still uses the stored JSON.
 */
export function presentPmPlanMarkdownForDisplay(
  text: string,
  options?: { fallbackProjectName?: string },
): string {
  const fallback =
    options?.fallbackProjectName?.trim() &&
    isPlausiblePmProjectName(options.fallbackProjectName)
      ? options.fallbackProjectName.trim()
      : undefined

  const resolveName = (parsed: unknown, textBefore: string): string | undefined =>
    readProjectNameFromParsed(parsed) ||
    inferPmPlanProjectNameFromText(textBefore) ||
    fallback

  let replacedFence = false
  const withFences = text.replace(
    /```(?:json)?\s*([\s\S]*?)```/gi,
    (full, body: string, offset: number) => {
      try {
        const parsed = JSON.parse(body.trim()) as unknown
        const plan = Array.isArray(parsed)
          ? ({ wbs: parseWbsArray(parsed) } satisfies PmParsedPlanFromText)
          : parsePlanObject(parsed)
        if (!plan || plan.wbs.length === 0) return full
        replacedFence = true
        return formatPmPlanAsMarkdownTable(plan, {
          projectName: resolveName(parsed, text.slice(0, offset)),
        })
      } catch {
        return full
      }
    },
  )

  let presented = withFences
  if (replacedFence) {
    presented = withFences
  } else {
    const trimmed = text.trim()
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      const plan = parsePmFullPlanFromText(trimmed)
      if (plan.wbs.length > 0) {
        let parsed: unknown
        try {
          parsed = JSON.parse(trimmed)
        } catch {
          parsed = null
        }
        presented = formatPmPlanAsMarkdownTable(plan, {
          projectName: resolveName(parsed, text),
        })
      }
    }
  }

  // Resource plan fences / raw JSON → readable table (after WBS presentation).
  return presentPmResourcePlanMarkdownForDisplay(presented)
}

function splitMarkdownRow(line: string): string[] {
  return line
    .split('|')
    .map((cell) => cell.trim())
    .filter((cell) => cell.length > 0)
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
    if (result.success) {
      suggestions.push(result.data)
    }
  }

  return suggestions
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
      return {
        startDate,
        dueDate: startDate + (duration - 1) * dayMs,
      }
    }
    if (dueDate != null) {
      return {
        startDate: dueDate - (duration - 1) * dayMs,
        dueDate,
      }
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
    if (Number.isFinite(value)) {
      max = Math.max(max, value)
    }
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
    if (Number.isFinite(seq)) {
      maxSeq = Math.max(maxSeq, seq)
    }
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
  const durationLine =
    input.durationDays != null && input.durationDays > 0
      ? String(input.durationDays)
      : '（未指定，请从概况推断总日历天与起止）'
  const extraLines = [
    input.code?.trim() ? `- 编号：${input.code.trim()}` : null,
    input.planStart?.trim() ? `- 计划开始：${input.planStart.trim()}` : null,
    input.planFinish?.trim() ? `- 计划完成：${input.planFinish.trim()}` : null,
    input.planPhase?.trim() ? `- 计划阶段：${input.planPhase.trim()}` : null,
    input.period?.trim() ? `- 计划周期：${input.period.trim()}` : null,
    input.region?.trim() ? `- 区域：${input.region.trim()}` : null,
  ].filter(Boolean)

  return `请根据以下新建项目简报，生成完整可解析的甘特计划（层级 WBS + 排期 + 前置关系）。

## 项目简报
- 名称：${input.name}
- 概况：${input.overview}
- 工期总日历天：${durationLine}${extraLines.length > 0 ? `\n${extraLines.join('\n')}` : ''}

## 输出要求
1. **先**输出 Markdown 任务表（给人阅读），列固定为：
   | 层级 | 任务名称 | 工期(天) | 开始日期 | 完成日期 | 前置任务 |
   - 第 1 行必须是**当前项目名称**（层级 1，如 PRJ 编号 · 项目名），工期/起止为项目总工期；不要把说明文字写入任务名称。其余任务全部挂在其下（1.1、1.1.1…）。
   - 前置任务列用**层级编号**写逻辑关系，如 \`1.1FS\`、\`1.2SS+5\`（不要写任务名称）；无前置写 —。
   - 层级用 1 / 1.1 / 1.1.1 表示父子；不要在表格里贴 JSON。
2. **再**输出一个 JSON 对象（\`\`\`json 代码块），供系统应用计划，格式：
{
  "projectName": "${input.name}",
  "projectPlan": {
    "planStart": "YYYY-MM-DD",
    "planFinish": "YYYY-MM-DD",
    "durationDays": number
  },
  "wbs": [
    {
      "title": "任务名称",
      "type": "wbs_node | phase | task | milestone",
      "parentTitle": "父任务标题（根节点可省略；根级任务的父为项目名称时可省略）",
      "durationDays": number,
      "startDate": "YYYY-MM-DD",
      "dueDate": "YYYY-MM-DD",
      "predecessors": [
        { "title": "前置任务标题", "type": "FS | SS | FF | SF", "lagDays": 0 }
      ],
      "priority": "low | normal | high | urgent"
    }
  ]
}
3. 层级覆盖单位/分部/分项/区域/部位等；父子用 parentTitle 指向已出现的父项 title。
4. 可另附 Markdown 排期表补日期（列：workItemTitle | suggestedStartDate | suggestedDueDate | reason）。
5. 标明项目级建议起止（projectPlan）；关键路径由系统在有关系与日期后计算，无需单独输出。
6. 除表格与 JSON 外不要写冗长散文；项目已在系统中创建，勿要求用户再次填写项目名称。
7. 前置关系必须连通：除整个计划中最早开始的那一项外，每个任务都要有 predecessors；从开工任务沿前置关系必须能到达竣工任务。禁止中段任务无前置（否则关键路径会从中段断开）。`
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
