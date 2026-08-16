import {
  normalizePmWbsHierarchy,
  PmProjectPlanSchema,
  PmWbsSuggestionSchema,
  type PmParsedPlanFromText,
  type PmProjectPlan,
  type PmWbsPredecessor,
  type PmWbsSuggestion,
} from './pm-plan-schemas.js'

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

export function parseWbsArray(parsed: unknown): PmWbsSuggestion[] {
  if (!Array.isArray(parsed)) return []
  const suggestions: PmWbsSuggestion[] = []
  for (const entry of parsed) {
    const result = PmWbsSuggestionSchema.safeParse(entry)
    if (result.success) suggestions.push(result.data)
  }
  return suggestions
}

export function parsePlanObject(parsed: unknown): PmParsedPlanFromText | null {
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

export function splitMarkdownRow(line: string): string[] {
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
  const re = /(\d+(?:\.\d+)*)\s*(FS|SS|FF|SF)\s*([+-]\d+)?/gi
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
