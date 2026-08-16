import { presentPmResourcePlanMarkdownForDisplay } from './pm-resource-apply.js'
import { presentPmCostPlanMarkdownForDisplay } from './pm-cost-apply.js'
import {
  parsePlanObject,
  parsePmFullPlanFromText,
  parseWbsArray,
} from './pm-plan-parse.js'
import {
  inferPmPlanProjectNameFromText,
  isPlausiblePmProjectName,
  normalizePmWbsHierarchy,
  readProjectNameFromParsed,
  type PmParsedPlanFromText,
  type PmWbsSuggestion,
} from './pm-plan-schemas.js'

function escapeMarkdownTableCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ').trim()
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
  if ((durationDays === '—' || durationDays == null) && startDate && dueDate) {
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
