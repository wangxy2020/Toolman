import { z } from 'zod'

import { PmWorkItemRelationTypeSchema } from './pm-schedule-types.js'
import {
  PmWorkItemPrioritySchema,
  PmWorkItemTypeSchema,
} from './pm-types.js'
import { presentPmResourcePlanMarkdownForDisplay } from './pm-resource-apply.js'
import { presentPmCostPlanMarkdownForDisplay } from './pm-cost-apply.js'

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

function normalizeTitle(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? ''
}

/**
 * Normalize model WBS output before display/apply:
 * - remove a duplicated project root (the project already owns the WBS)
 * - place each parent immediately before its descendants
 * - keep dependencies on executable leaves, not summary/group rows
 */
export function normalizePmWbsHierarchy(
  wbs: PmWbsSuggestion[],
  projectName?: string,
): PmWbsSuggestion[] {
  if (wbs.length === 0) return []

  const normalizedProjectName = normalizeTitle(projectName)
  const duplicateRoot = wbs.find((item) => {
    if (item.parentTitle?.trim()) return false
    if (item.type !== 'wbs_node' && item.type !== 'phase') return false
    const title = normalizeTitle(item.title)
    return (
      Boolean(normalizedProjectName) &&
      (title === normalizedProjectName ||
        title.endsWith(` · ${normalizedProjectName}`) ||
        title.endsWith(` - ${normalizedProjectName}`))
    )
  })
  const duplicateRootTitle = normalizeTitle(duplicateRoot?.title)

  const stripped = wbs
    .filter((item) => item !== duplicateRoot)
    .map((item) => ({
      ...item,
      parentTitle:
        duplicateRootTitle && normalizeTitle(item.parentTitle) === duplicateRootTitle
          ? undefined
          : item.parentTitle,
    }))

  const titleSet = new Set(stripped.map((item) => normalizeTitle(item.title)))
  const childrenByParent = new Map<string, PmWbsSuggestion[]>()
  const roots: PmWbsSuggestion[] = []
  for (const item of stripped) {
    const parentKey = normalizeTitle(item.parentTitle)
    if (!parentKey || parentKey === normalizeTitle(item.title) || !titleSet.has(parentKey)) {
      roots.push(item)
      continue
    }
    const siblings = childrenByParent.get(parentKey) ?? []
    siblings.push(item)
    childrenByParent.set(parentKey, siblings)
  }

  const result: PmWbsSuggestion[] = []
  const visited = new Set<PmWbsSuggestion>()
  const visit = (item: PmWbsSuggestion) => {
    if (visited.has(item)) return
    visited.add(item)
    const children = childrenByParent.get(normalizeTitle(item.title)) ?? []
    result.push(children.length > 0 ? { ...item, predecessors: [] } : item)
    for (const child of children) visit(child)
  }
  for (const root of roots) visit(root)
  // Preserve malformed/cyclic rows rather than silently dropping them.
  for (const item of stripped) visit(item)
  return result
}

function parsePlanObject(parsed: unknown): PmParsedPlanFromText | null {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const record = parsed as Record<string, unknown>
  const wbsRaw = record.wbs ?? record.items ?? record.suggestions
  const projectName =
    typeof record.projectName === 'string' ? record.projectName.trim() : undefined
  const wbs = normalizePmWbsHierarchy(parseWbsArray(wbsRaw), projectName)
  if (wbs.length === 0) return null
  const projectPlanResult = PmProjectPlanSchema.safeParse(record.projectPlan)
  return {
    wbs,
    projectPlan: projectPlanResult.success ? projectPlanResult.data : undefined,
  }
}

function splitMarkdownRow(line: string): string[] {
  return line
    .split('|')
    .map((cell) => cell.trim())
    .filter((cell) => cell.length > 0)
}

function isMarkdownSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell))
}

function normalizeOutlineId(raw: string): string | null {
  const cleaned = raw.replace(/[\u3000\s]+/g, '').replace(/、$/, '')
  if (!/^\d+(?:\.\d+)*$/.test(cleaned)) return null
  return cleaned
}

function parentOutlineId(outline: string): string | null {
  const parts = outline.split('.')
  if (parts.length <= 1) return null
  return parts.slice(0, -1).join('.')
}

function parseOptionalDurationDays(raw: string): number | undefined {
  const cleaned = raw.replace(/[天日dD]/g, '').trim()
  if (!cleaned || cleaned === '—' || cleaned === '-' || cleaned === '–') return undefined
  const value = Number.parseInt(cleaned, 10)
  return Number.isFinite(value) && value > 0 ? value : undefined
}

function parseOptionalIsoDate(raw: string): string | undefined {
  const cleaned = raw.trim()
  if (!cleaned || cleaned === '—' || cleaned === '-' || cleaned === '–') return undefined
  const match = cleaned.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (!match) return undefined
  const year = match[1]!
  const month = match[2]!.padStart(2, '0')
  const day = match[3]!.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseOutlinePredecessorRefs(
  raw: string,
  titleByOutline: Map<string, string>,
): PmWbsPredecessor[] {
  const cleaned = raw.trim()
  if (!cleaned || cleaned === '—' || cleaned === '-' || cleaned === '–' || cleaned === '—*' ) {
    return []
  }
  // Ignore free-form notes that are not outline refs.
  if (!/\d/.test(cleaned) || !/(FS|SS|FF|SF)/i.test(cleaned)) return []

  const predecessors: PmWbsPredecessor[] = []
  const re =
    /(\d+(?:\.\d+)*)\s*(FS|SS|FF|SF)\s*([+-]\d+)?/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(cleaned)) != null) {
    const outline = match[1]!
    const title = titleByOutline.get(outline)
    if (!title) continue
    const lagRaw = match[3]
    const lagDays = lagRaw ? Number.parseInt(lagRaw, 10) : 0
    predecessors.push({
      title,
      type: match[2]!.toUpperCase() as NonNullable<PmWbsPredecessor['type']>,
      ...(Number.isFinite(lagDays) && lagDays !== 0 ? { lagDays } : {}),
    })
  }
  return predecessors
}

function inferWbsTypeFromOutline(
  outline: string,
  childOutlines: Set<string>,
  title: string,
  durationDays: number | undefined,
): NonNullable<PmWbsSuggestion['type']> {
  if (/里程碑|milestone/i.test(title) || durationDays === 0) return 'milestone'
  const hasChild = [...childOutlines].some(
    (child) => child.startsWith(`${outline}.`) && child !== outline,
  )
  if (hasChild) {
    const depth = outline.split('.').length
    return depth <= 2 ? 'phase' : 'wbs_node'
  }
  return 'task'
}

/**
 * Parse the human-readable WBS markdown table:
 * | 层级 | 任务名称 | 工期(天) | 开始日期 | 完成日期 | 前置任务 |
 *
 * Row outline `1` is treated as the project root (feeds projectPlan) and is not
 * included in the returned WBS list.
 */
export function parsePmWbsMarkdownTableFromText(text: string): PmParsedPlanFromText {
  const lines = text.split('\n')
  let headerIndex = -1
  let headerCells: string[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? ''
    if (!line.includes('|')) continue
    const cells = splitMarkdownRow(line)
    if (cells.length < 4) continue
    const joined = cells.join(' ')
    if (
      /层级/.test(joined) &&
      /任务名称|名称|标题/.test(joined) &&
      (/工期/.test(joined) || /开始/.test(joined))
    ) {
      headerIndex = index
      headerCells = cells
      break
    }
  }
  if (headerIndex < 0) return { wbs: [] }

  const findCol = (...names: string[]): number =>
    headerCells.findIndex((cell) => names.some((name) => cell.includes(name)))

  const outlineCol = findCol('层级')
  const titleCol = findCol('任务名称', '名称', '标题')
  const durationCol = findCol('工期')
  const startCol = findCol('开始')
  const dueCol = findCol('完成', '结束', '截止')
  const predCol = findCol('前置')
  if (outlineCol < 0 || titleCol < 0) return { wbs: [] }

  type Row = {
    outline: string
    title: string
    durationDays?: number
    startDate?: string
    dueDate?: string
    predecessorRaw: string
  }
  const rows: Row[] = []

  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? ''
    if (!line.includes('|')) {
      if (rows.length > 0 && line.startsWith('#')) break
      if (rows.length > 0 && line === '') continue
      if (rows.length > 0 && !line.startsWith('|')) break
      continue
    }
    const cells = splitMarkdownRow(line)
    if (isMarkdownSeparatorRow(cells)) continue
    const outline = normalizeOutlineId(cells[outlineCol] ?? '')
    const title = (cells[titleCol] ?? '').replace(/^[\u3000\s]+/, '').trim()
    if (!outline || !title) continue
    rows.push({
      outline,
      title,
      durationDays:
        durationCol >= 0 ? parseOptionalDurationDays(cells[durationCol] ?? '') : undefined,
      startDate: startCol >= 0 ? parseOptionalIsoDate(cells[startCol] ?? '') : undefined,
      dueDate: dueCol >= 0 ? parseOptionalIsoDate(cells[dueCol] ?? '') : undefined,
      predecessorRaw: predCol >= 0 ? (cells[predCol] ?? '') : '',
    })
  }

  if (rows.length === 0) return { wbs: [] }

  const titleByOutline = new Map(rows.map((row) => [row.outline, row.title]))
  const outlines = new Set(rows.map((row) => row.outline))
  const root = rows.find((row) => row.outline === '1') ?? rows[0]!
  const projectPlan: PmProjectPlan | undefined =
    root.startDate || root.dueDate || root.durationDays
      ? {
          ...(root.startDate ? { planStart: root.startDate } : {}),
          ...(root.dueDate ? { planFinish: root.dueDate } : {}),
          ...(root.durationDays ? { durationDays: root.durationDays } : {}),
        }
      : undefined

  const wbsRows = rows.filter((row) => row.outline !== root.outline)
  const wbs: PmWbsSuggestion[] = wbsRows.map((row) => {
    const parentOutline = parentOutlineId(row.outline)
    const parentTitle =
      parentOutline && parentOutline !== root.outline
        ? titleByOutline.get(parentOutline)
        : undefined
    const predecessors = parseOutlinePredecessorRefs(row.predecessorRaw, titleByOutline).filter(
      (item) => item.title !== row.title && item.title !== root.title,
    )
    return {
      title: row.title,
      type: inferWbsTypeFromOutline(row.outline, outlines, row.title, row.durationDays),
      ...(parentTitle ? { parentTitle } : {}),
      ...(row.durationDays != null ? { durationDays: row.durationDays } : {}),
      ...(row.startDate ? { startDate: row.startDate } : {}),
      ...(row.dueDate ? { dueDate: row.dueDate } : {}),
      ...(predecessors.length > 0 ? { predecessors } : {}),
    }
  })

  return {
    wbs: normalizePmWbsHierarchy(wbs, root.title),
    projectPlan,
  }
}

export function parsePmFullPlanFromText(text: string): PmParsedPlanFromText {
  // Prefer the human-readable WBS table — this is the primary contract.
  const fromTable = parsePmWbsMarkdownTableFromText(text)
  if (fromTable.wbs.length > 0) return fromTable

  // Backward compatibility for older messages that still embed JSON payloads.
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
        const wbs = normalizePmWbsHierarchy(parseWbsArray(parsed))
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
    const indent = '\u3000'.repeat(depth)
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
  const brief = presentPmNewProjectBriefForDisplay(text)
  if (brief !== text) return brief
  const hasReadableWbsTable =
    /\|\s*层级\s*\|\s*任务名称\s*\|\s*工期(?:\(天\)|（天）)?\s*\|/.test(text)

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
          ? ({ wbs: normalizePmWbsHierarchy(parseWbsArray(parsed)) } satisfies PmParsedPlanFromText)
          : parsePlanObject(parsed)
        if (!plan || plan.wbs.length === 0) return full
        replacedFence = true
        // The machine payload is required by the apply button, but a preceding
        // human-readable WBS table already contains everything the user needs.
        if (hasReadableWbsTable) return ''
        return formatPmPlanAsMarkdownTable(plan, {
          projectName: resolveName(parsed, text.slice(0, offset)),
        })
      } catch {
        return full
      }
    },
  )

  let presented = withFences
  if (replacedFence && hasReadableWbsTable) {
    // Hide only the machine JSON section. Keep later human sections such as
    // 关键路径 / 调度说明 when the model includes them.
    presented = withFences
      .replace(
        /^#{1,6}\s*(?:[一二三四五六七八九十]+[、.．]\s*)?(?:系统\s*)?JSON(?:\s*[（(][^）)]*[）)])?.*(?:\n+---)?\s*$/gim,
        '',
      )
      .replace(/(?:^|\n)---\s*(?=\n+#{1,6}\s)/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  } else if (replacedFence) {
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

  // Resource / cost plan fences / raw JSON → readable tables (after WBS presentation).
  return presentPmCostPlanMarkdownForDisplay(presentPmResourcePlanMarkdownForDisplay(presented))
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

const PM_NEW_PROJECT_BRIEF_MARKER = '请根据以下新建项目简报'
const PM_BRIEF_SECTION_HEADING = '## 项目简报'
const PM_BRIEF_REQUIREMENTS_HEADING = '## 输出要求'

/**
 * Render the kickoff brief as a readable summary for chat display.
 * The stored message keeps the full output contract that the model needs.
 */
export function presentPmNewProjectBriefForDisplay(text: string): string {
  if (!text.includes(PM_NEW_PROJECT_BRIEF_MARKER)) return text
  const briefStart = text.indexOf(PM_BRIEF_SECTION_HEADING)
  if (briefStart < 0) return text
  const requirementsStart = text.indexOf(PM_BRIEF_REQUIREMENTS_HEADING, briefStart)
  const briefBody = (
    requirementsStart > briefStart
      ? text.slice(briefStart + PM_BRIEF_SECTION_HEADING.length, requirementsStart)
      : text.slice(briefStart + PM_BRIEF_SECTION_HEADING.length)
  ).trim()
  if (!briefBody) return text

  const fields = briefBody
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('-'))
    .map((line) =>
      line.replace(
        /^-\s*工期总日历天：（未指定[^）]*）\s*$/,
        '- 工期总日历天：未指定（由智能体依据概况推断）',
      ),
    )

  const lines = fields.length > 0 ? fields : [briefBody]
  return ['### 新建项目', '', ...lines, '', '请计划智能体生成层级 WBS、排期与前置关系。'].join(
    '\n',
  )
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
