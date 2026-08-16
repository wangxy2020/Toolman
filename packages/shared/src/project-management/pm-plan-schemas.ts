import { z } from 'zod'

import { PmWorkItemRelationTypeSchema } from './pm-schedule-types.js'
import {
  PmWorkItemPrioritySchema,
  PmWorkItemTypeSchema,
} from './pm-types.js'

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

export function readProjectNameFromParsed(parsed: unknown): string | undefined {
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
