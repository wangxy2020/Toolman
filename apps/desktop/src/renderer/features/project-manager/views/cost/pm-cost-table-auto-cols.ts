import { formatPmDecimalDisplay } from '../../PmDecimalTableInput'
import {
  computeCostRowTotalPrice,
  costSectionalGroupMapKey,
  costSectionalWorkKey,
  costSubprojectKey,
  formatCostTotalPrice,
  sumCostRowsTotalPrice,
  type CostSectionalGroupBy,
  type PmCostRow,
} from './pm-cost-catalog'
import type { CostColumnVisibility } from './pm-cost-column-prefs'

export const COST_TABLE_AUTO_COLUMNS = [
  'subproject',
  'sectionalWork',
  'code',
  'name',
  'featureDescription',
  'unit',
  'quantity',
  'unitPrice',
  'totalPrice',
] as const

export const COST_TABLE_WRAP_COLUMNS = ['name', 'featureDescription'] as const

export const COST_TABLE_FEATURE_COL_WIDTH_PX = 160
export const COST_TABLE_WRAP_LINE_HEIGHT_PX = 18
export const COST_TABLE_WRAP_PAD_Y = 8
const COST_TABLE_WRAP_CELL_PAD_Y = 8
/** Shared cap for 工作名称 and 特征描述. */
export const COST_TABLE_WRAP_COL_MAX_PX = 280
export type CostTableWrapLayout = 'split' | 'nameOnly'

export type CostTableAutoColumn = (typeof COST_TABLE_AUTO_COLUMNS)[number]

export type CostTableAutoColWidths = Partial<Record<CostTableAutoColumn, number>>

export type CostTableAutoColLabels = Partial<Record<CostTableAutoColumn, string>>

const BODY_FONT = '13px ui-sans-serif, system-ui, -apple-system, "PingFang SC", sans-serif'
const HEADER_FONT = '600 11px ui-sans-serif, system-ui, -apple-system, "PingFang SC", sans-serif'
const CELL_PAD_X = 16
const INPUT_PAD_X = 12
const TEXT_SLACK = 10

const INPUT_CHROME = CELL_PAD_X + INPUT_PAD_X + TEXT_SLACK
const TEXT_CHROME = CELL_PAD_X + TEXT_SLACK

const COL_MIN: Record<CostTableAutoColumn, number> = {
  subproject: 72,
  sectionalWork: 72,
  code: 56,
  name: 120,
  featureDescription: 160,
  unit: 48,
  quantity: 72,
  unitPrice: 72,
  totalPrice: 80,
}

const COL_MAX: Record<CostTableAutoColumn, number> = {
  subproject: 240,
  sectionalWork: 240,
  code: 200,
  name: COST_TABLE_WRAP_COL_MAX_PX,
  featureDescription: COST_TABLE_WRAP_COL_MAX_PX,
  unit: 120,
  quantity: 168,
  unitPrice: 180,
  totalPrice: 220,
}

/** Prefer wrapping around this content width instead of stretching a long sentence. */
const COL_WRAP_TARGET: Record<(typeof COST_TABLE_WRAP_COLUMNS)[number], number> = {
  name: 160,
  featureDescription: 200,
}

const COL_CHROME: Record<CostTableAutoColumn, number> = {
  subproject: INPUT_CHROME,
  sectionalWork: INPUT_CHROME,
  code: INPUT_CHROME,
  name: INPUT_CHROME,
  featureDescription: INPUT_CHROME,
  unit: INPUT_CHROME,
  quantity: INPUT_CHROME,
  unitPrice: INPUT_CHROME,
  totalPrice: TEXT_CHROME,
}

const FIXED_INDEX_WIDTH = 48
const FIXED_SPACER_MIN = 16
const FIXED_TYPE_WIDTH = 120
const FIXED_NOTE_WIDTH = 180
const FIXED_BASELINE_WIDTH = 72

let measureCanvas: HTMLCanvasElement | null = null

export function estimateCostTableTextWidth(text: string): number {
  let width = 0
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    if (code <= 0x7f) {
      width += /[0-9]/.test(char) ? 8 : char === ',' || char === '.' ? 4.5 : char === ' ' ? 4 : 7.6
    } else {
      width += 13
    }
  }
  return width
}

export function measureCostTableTextWidth(text: string, font: string): number {
  if (typeof document === 'undefined') return estimateCostTableTextWidth(text)
  try {
    measureCanvas ??= document.createElement('canvas')
    const context = measureCanvas.getContext('2d')
    if (!context) return estimateCostTableTextWidth(text)
    context.font = font
    return context.measureText(text).width
  } catch {
    return estimateCostTableTextWidth(text)
  }
}

function longestTexts(values: Iterable<string>, keep = 8): string[] {
  const ranked: string[] = []
  const seen = new Set<string>()
  for (const raw of values) {
    const text = raw.trim()
    if (!text || seen.has(text)) continue
    seen.add(text)
    if (ranked.length < keep) {
      ranked.push(text)
      ranked.sort((left, right) => right.length - left.length)
      continue
    }
    if (text.length > (ranked[keep - 1]?.length ?? 0)) {
      ranked[keep - 1] = text
      ranked.sort((left, right) => right.length - left.length)
    }
  }
  return ranked
}

function isWrapColumn(column: CostTableAutoColumn): column is (typeof COST_TABLE_WRAP_COLUMNS)[number] {
  return (COST_TABLE_WRAP_COLUMNS as readonly string[]).includes(column)
}

function fitWidth(
  column: CostTableAutoColumn,
  contentPx: number,
  headerPx: number,
  options?: { wrap?: boolean },
): number {
  const measured = options?.wrap && isWrapColumn(column)
    ? Math.min(contentPx, Math.max(contentPx / 2, COL_WRAP_TARGET[column]))
    : contentPx
  const next = Math.ceil(Math.max(measured + COL_CHROME[column], headerPx + CELL_PAD_X + TEXT_SLACK))
  return Math.min(COL_MAX[column], Math.max(COL_MIN[column], next))
}

function longestLineTexts(values: Iterable<string>, keep = 8): string[] {
  const lines: string[] = []
  for (const raw of values) {
    for (const line of raw.split('\n')) lines.push(line)
  }
  return longestTexts(lines, keep)
}

function neededWrapWidth(column: CostTableAutoColumn, contentPx: number, headerPx: number): number {
  const next = Math.ceil(Math.max(contentPx + COL_CHROME[column], headerPx + CELL_PAD_X + TEXT_SLACK))
  return Math.min(COL_MAX[column], Math.max(COL_MIN[column], next))
}

function maxMeasured(texts: readonly string[], font: string): number {
  let widest = 0
  for (const text of texts) {
    const width = measureCostTableTextWidth(text, font)
    if (width > widest) widest = width
  }
  return widest
}

export function computeCostTableAutoColWidths(input: {
  rows: readonly PmCostRow[]
  childrenByParentId?: ReadonlyMap<string, PmCostRow[]>
  labels?: CostTableAutoColLabels
  visibility?: Partial<CostColumnVisibility>
  groupBy?: CostSectionalGroupBy
  availableWidth?: number
  baselineWidth?: number
  wrapLayout?: CostTableWrapLayout
}): CostTableAutoColWidths {
  const { rows, childrenByParentId, labels = {}, visibility } = input
  const widths: CostTableAutoColWidths = {}
  const wrapNeed: Partial<Record<CostTableAutoColumn, number>> = {}
  const include = (column: CostTableAutoColumn) => visibility?.[column] !== false

  if (include('subproject')) {
    widths.subproject = fitWidth(
      'subproject',
      maxMeasured(
        longestTexts(rows.map((row) => row.subproject ?? '')),
        BODY_FONT,
      ),
      measureCostTableTextWidth(labels.subproject ?? '', HEADER_FONT),
    )
  }
  if (include('sectionalWork')) {
    widths.sectionalWork = fitWidth(
      'sectionalWork',
      maxMeasured(
        longestTexts(rows.map((row) => row.sectionalWork ?? '')),
        BODY_FONT,
      ),
      measureCostTableTextWidth(labels.sectionalWork ?? '', HEADER_FONT),
    )
  }
  if (include('code')) {
    widths.code = fitWidth(
      'code',
      maxMeasured(longestTexts(rows.map((row) => row.code ?? '')), BODY_FONT),
      measureCostTableTextWidth(labels.code ?? '', HEADER_FONT),
    )
  }
  if (include('name')) {
    const headerPx = measureCostTableTextWidth(labels.name ?? '', HEADER_FONT)
    const contentPx = maxMeasured(longestLineTexts(rows.map((row) => row.name ?? '')), BODY_FONT)
    widths.name = fitWidth('name', contentPx, headerPx, { wrap: true })
    wrapNeed.name = neededWrapWidth('name', contentPx, headerPx)
  }
  if (include('featureDescription')) {
    const headerPx = measureCostTableTextWidth(labels.featureDescription ?? '', HEADER_FONT)
    const contentPx = maxMeasured(
      longestLineTexts(rows.map((row) => row.featureDescription ?? '')),
      BODY_FONT,
    )
    widths.featureDescription = fitWidth('featureDescription', contentPx, headerPx, { wrap: true })
    wrapNeed.featureDescription = neededWrapWidth('featureDescription', contentPx, headerPx)
  }
  if (include('unit')) {
    widths.unit = fitWidth(
      'unit',
      maxMeasured(longestTexts(rows.map((row) => row.unit ?? '')), BODY_FONT),
      measureCostTableTextWidth(labels.unit ?? '', HEADER_FONT),
    )
  }
  if (include('quantity')) {
    widths.quantity = fitWidth(
      'quantity',
      maxMeasured(
        longestTexts(rows.map((row) => formatPmDecimalDisplay(row.quantity, { blankZero: true }))),
        BODY_FONT,
      ),
      measureCostTableTextWidth(labels.quantity ?? '', HEADER_FONT),
    )
  }
  if (include('unitPrice')) {
    widths.unitPrice = fitWidth(
      'unitPrice',
      maxMeasured(
        longestTexts(rows.map((row) => formatPmDecimalDisplay(row.unitPrice, { blankZero: true }))),
        BODY_FONT,
      ),
      measureCostTableTextWidth(labels.unitPrice ?? '', HEADER_FONT),
    )
  }
  if (include('totalPrice')) {
    const totals = rows.map((row) =>
      formatCostTotalPrice(computeCostRowTotalPrice(row, rows, childrenByParentId)),
    )
    const groupBy = input.groupBy ?? 'section'
    const bySection = new Map<string, PmCostRow[]>()
    for (const row of rows) {
      const key = costSectionalGroupMapKey(
        costSubprojectKey(row),
        costSectionalWorkKey(row),
        groupBy,
      )
      const group = bySection.get(key)
      if (group) group.push(row)
      else bySection.set(key, [row])
    }
    for (const group of bySection.values()) {
      totals.push(formatCostTotalPrice(sumCostRowsTotalPrice(group)))
    }
    widths.totalPrice = fitWidth(
      'totalPrice',
      maxMeasured(longestTexts(totals), BODY_FONT),
      measureCostTableTextWidth(labels.totalPrice ?? '', HEADER_FONT),
    )
  }
  expandWrapColumnsToViewport(widths, wrapNeed, {
    availableWidth: input.availableWidth,
    visibility,
    baselineWidth: input.baselineWidth,
  })
  applyWrapColumnLayout(widths, input.wrapLayout ?? detectCostTableWrapLayout(rows, visibility))
  return widths
}

export function detectCostTableWrapLayout(
  rows: readonly Pick<PmCostRow, 'featureDescription'>[],
  visibility?: Partial<CostColumnVisibility>,
): CostTableWrapLayout {
  if (visibility?.featureDescription === false) return 'nameOnly'
  const hasFeature = rows.some((row) => (row.featureDescription ?? '').trim().length > 0)
  return hasFeature ? 'split' : 'nameOnly'
}

function applyWrapColumnLayout(widths: CostTableAutoColWidths, layout: CostTableWrapLayout) {
  const nameVisible = widths.name != null
  const featureVisible = widths.featureDescription != null
  if (layout === 'nameOnly') {
    if (nameVisible) widths.name = COST_TABLE_WRAP_COL_MAX_PX
    return
  }
  if (featureVisible) {
    const feature = Math.min(
      COST_TABLE_WRAP_COL_MAX_PX,
      Math.max(COL_MIN.featureDescription, widths.featureDescription ?? COL_MIN.featureDescription),
    )
    widths.featureDescription = feature
    if (nameVisible) widths.name = Math.max(COL_MIN.name, Math.round(feature / 2))
    return
  }
  if (nameVisible) widths.name = COST_TABLE_WRAP_COL_MAX_PX
}

function expandWrapColumnsToViewport(
  widths: CostTableAutoColWidths,
  wrapNeed: Partial<Record<CostTableAutoColumn, number>>,
  input: {
    availableWidth?: number
    visibility?: Partial<CostColumnVisibility>
    baselineWidth?: number
  },
) {
  const available = input.availableWidth ?? 0
  if (available <= 0) return
  const visibility = input.visibility
  let used = FIXED_INDEX_WIDTH + FIXED_SPACER_MIN
  if (visibility?.type !== false) used += FIXED_TYPE_WIDTH
  if (visibility?.baseline !== false) used += input.baselineWidth ?? FIXED_BASELINE_WIDTH
  if (visibility?.note !== false) used += FIXED_NOTE_WIDTH
  for (const width of Object.values(widths)) {
    if (width != null) used += width
  }
  let leftover = available - used
  if (leftover <= 0) return
  const rooms = COST_TABLE_WRAP_COLUMNS.flatMap((column) => {
    const current = widths[column]
    if (current == null) return []
    const room = Math.max(0, (wrapNeed[column] ?? current) - current)
    return room > 0 ? [{ column, room }] : []
  })
  const totalRoom = rooms.reduce((sum, item) => sum + item.room, 0)
  if (totalRoom <= 0) return
  for (const item of rooms) {
    const share = Math.min(item.room, Math.floor((leftover * item.room) / totalRoom))
    widths[item.column] = (widths[item.column] ?? 0) + share
    leftover -= share
  }
}

export function costTableAutoColStyle(
  width: number | undefined,
): { width: number; minWidth: number; maxWidth: number } | undefined {
  if (width == null) return undefined
  return { width, minWidth: width, maxWidth: width }
}

export function estimateWrappedBlockHeight(text: string, columnWidth: number): number {
  const inner = Math.max(24, columnWidth - CELL_PAD_X - INPUT_PAD_X)
  const paragraphs = (text ?? '').split('\n')
  let lines = 0
  for (const para of paragraphs) {
    if (!para) {
      lines += 1
      continue
    }
    const width = measureCostTableTextWidth(para, BODY_FONT)
    lines += Math.max(1, Math.ceil(width / inner))
  }
  if (lines <= 0) lines = 1
  return Math.max(
    36,
    Math.ceil(
      lines * COST_TABLE_WRAP_LINE_HEIGHT_PX + COST_TABLE_WRAP_PAD_Y + COST_TABLE_WRAP_CELL_PAD_Y,
    ),
  )
}

export function estimateCostTableEntryHeight(input: {
  wrapName: boolean
  wrapFeature: boolean
  name?: string
  featureDescription?: string
  nameWidth: number
  featureWidth?: number
}): number {
  let height = 36
  if (input.wrapName) {
    height = Math.max(height, estimateWrappedBlockHeight(input.name ?? '', input.nameWidth))
  }
  if (input.wrapFeature) {
    height = Math.max(
      height,
      estimateWrappedBlockHeight(
        input.featureDescription ?? '',
        input.featureWidth ?? COST_TABLE_FEATURE_COL_WIDTH_PX,
      ),
    )
  }
  return height
}
