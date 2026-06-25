#!/usr/bin/env node
/**
 * Excel 无损审核高亮 MCP 服务端（Stdio）
 *
 * 工具：
 * - review_excel：只读扫描，输出结构化审核报告
 * - modify_excel_cells：仅改单元格 value/formula，保留原有样式
 * - highlight_excel_cells：设置填充色与批注，保留其他格式
 */
import { existsSync } from 'node:fs'
import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import ExcelJS from 'exceljs'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Types & helpers
// ---------------------------------------------------------------------------

type ReviewCheck =
  | 'empty'
  | 'formula_error'
  | 'duplicate_values'
  | 'numbers_as_text'
  | 'merged_cells'

interface ReviewIssue {
  sheet: string
  cell: string
  check: ReviewCheck
  severity: 'info' | 'warning' | 'error'
  message: string
  currentValue?: string | number | boolean | null
}

const REVIEW_CHECKS: ReviewCheck[] = [
  'empty',
  'formula_error',
  'duplicate_values',
  'numbers_as_text',
  'merged_cells',
]

const DEFAULT_HIGHLIGHT_COLOR = 'FFFF00'

function toolText(payload: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2),
      },
    ],
  }
}

function resolveFilePath(filePath: string): string {
  const absolute = resolve(filePath)
  if (!existsSync(absolute)) {
    throw new Error(`文件不存在: ${absolute}`)
  }
  return absolute
}

async function prepareWorkbookTarget(
  filePath: string,
  outputPath?: string,
): Promise<{ sourcePath: string; targetPath: string; workbook: ExcelJS.Workbook }> {
  const sourcePath = resolveFilePath(filePath)
  const targetPath = outputPath ? resolve(outputPath) : sourcePath

  if (outputPath) {
    await mkdir(dirname(targetPath), { recursive: true })
    if (targetPath !== sourcePath) {
      await copyFile(sourcePath, targetPath)
    }
  }

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(targetPath)
  return { sourcePath, targetPath, workbook }
}

async function saveWorkbook(workbook: ExcelJS.Workbook, targetPath: string): Promise<void> {
  await mkdir(dirname(targetPath), { recursive: true })
  await workbook.xlsx.writeFile(targetPath)
}

function getWorksheet(workbook: ExcelJS.Workbook, sheetName?: string): ExcelJS.Worksheet {
  if (sheetName) {
    const sheet = workbook.getWorksheet(sheetName)
    if (!sheet) {
      throw new Error(`工作表不存在: ${sheetName}`)
    }
    return sheet
  }
  const first = workbook.worksheets[0]
  if (!first) {
    throw new Error('工作簿中没有工作表')
  }
  return first
}

function listTargetSheets(workbook: ExcelJS.Workbook, sheetName?: string): ExcelJS.Worksheet[] {
  if (sheetName) {
    return [getWorksheet(workbook, sheetName)]
  }
  return workbook.worksheets.filter((sheet) => sheet.state === 'visible' || sheet.state === undefined)
}

function parseCellAddress(address: string): { row: number; col: number } {
  const match = normalizeCellAddress(address).match(/^([A-Z]+)(\d+)$/)
  if (!match) {
    throw new Error(`无效的单元格地址: ${address}`)
  }
  const [, letters, rowText] = match
  let col = 0
  for (const ch of letters) {
    col = col * 26 + (ch.charCodeAt(0) - 64)
  }
  return { row: Number.parseInt(rowText, 10), col }
}

function encodeCellAddress(row: number, col: number): string {
  let letters = ''
  let remaining = col
  while (remaining > 0) {
    const mod = (remaining - 1) % 26
    letters = String.fromCharCode(65 + mod) + letters
    remaining = Math.floor((remaining - 1) / 26)
  }
  return `${letters}${row}`
}

function parseRangeBounds(
  range: string | undefined,
  worksheet: ExcelJS.Worksheet,
): { top: number; left: number; bottom: number; right: number } {
  if (range) {
    const parts = range.trim().split(':')
    const start = parseCellAddress(parts[0] ?? range)
    const end = parseCellAddress(parts[1] ?? parts[0] ?? range)
    return {
      top: Math.min(start.row, end.row),
      left: Math.min(start.col, end.col),
      bottom: Math.max(start.row, end.row),
      right: Math.max(start.col, end.col),
    }
  }

  const dim = worksheet.dimensions
  if (!dim) {
    return { top: 1, left: 1, bottom: 1, right: 1 }
  }

  return {
    top: dim.top ?? 1,
    left: dim.left ?? 1,
    bottom: dim.bottom ?? dim.top ?? 1,
    right: dim.right ?? dim.left ?? 1,
  }
}

function cellRef(row: number, col: number): string {
  return encodeCellAddress(row, col)
}

function normalizeCellAddress(address: string): string {
  const trimmed = address.trim().toUpperCase()
  if (!/^[A-Z]+[1-9][0-9]*$/.test(trimmed)) {
    throw new Error(`无效的单元格地址: ${address}`)
  }
  return trimmed
}

function toArgb(color?: string): string {
  const raw = (color ?? DEFAULT_HIGHLIGHT_COLOR).trim().replace(/^#/, '').toUpperCase()
  if (/^[0-9A-F]{8}$/.test(raw)) return raw
  if (/^[0-9A-F]{6}$/.test(raw)) return `FF${raw}`
  throw new Error(`无效颜色，请使用 RRGGBB 或 AARRGGBB: ${color}`)
}

function serializeCellValue(cell: ExcelJS.Cell): string | number | boolean | null {
  const value = cell.value
  if (value == null) return null
  if (typeof value === 'object' && 'formula' in value && value.formula) {
    let result: ExcelJS.CellValue | null | undefined
    try {
      result = cell.result
    } catch {
      return `=${value.formula}`
    }
    if (result == null) return `=${value.formula}`
    return `=${value.formula} → ${String(result)}`
  }
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object' && 'richText' in value && Array.isArray(value.richText)) {
    return value.richText.map((part) => part.text ?? '').join('')
  }
  if (typeof value === 'object' && 'text' in value && typeof value.text === 'string') {
    return value.text
  }
  if (typeof value === 'object' && 'error' in value) {
    return String(value.error)
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return ''
    }
  }
  return value as string | number | boolean
}

function isMergeSlave(cell: ExcelJS.Cell): boolean {
  return Boolean(cell.isMerged && cell.master && cell.address !== cell.master.address)
}

function resolveReadCell(cell: ExcelJS.Cell): ExcelJS.Cell {
  if (isMergeSlave(cell)) {
    return cell.master!
  }
  return cell
}

function safeCellText(cell: ExcelJS.Cell): string {
  const target = resolveReadCell(cell)
  try {
    return target.text?.trim() ?? ''
  } catch {
    const serialized = serializeCellValue(target)
    return serialized == null ? '' : String(serialized)
  }
}

function isFormulaError(cell: ExcelJS.Cell): boolean {
  if (cell.type === ExcelJS.ValueType.Error) return true
  const value = cell.value
  if (value && typeof value === 'object' && 'error' in value) return true
  const text = safeCellText(cell)
  return text.startsWith('#') && text.endsWith('!')
}

function looksNumericText(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  if (!trimmed) return false
  return /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(trimmed)
}

function applyCellModification(cell: ExcelJS.Cell, change: { value?: unknown; formula?: string }) {
  if (change.formula != null && change.formula.trim() !== '') {
    const formula = change.formula.trim().replace(/^=/, '')
    cell.value = { formula }
    return
  }
  if (change.value !== undefined) {
    cell.value = change.value as ExcelJS.CellValue
  }
}

function getWorksheetMerges(worksheet: ExcelJS.Worksheet): string[] {
  return (
    (worksheet as ExcelJS.Worksheet & { model?: { merges?: string[] } }).model?.merges ?? []
  )
}

function cellHasVisibleText(cell: ExcelJS.Cell): boolean {
  return Boolean(safeCellText(cell))
}

function scoreAmountInWordsCellText(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  let score = 0
  if (/AMOUNT\s+IN\s+WORDS/i.test(text)) score += 100
  if (/SAY\s+U\.?S\.?\s+DOLLARS/i.test(text)) score += 80
  if (/\b(?:ONE|HUNDRED|THOUSAND)\b/i.test(text) && /CENTS?\s+ONLY/i.test(text)) score += 20
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) score -= 100
  if (/^=/.test(trimmed)) score -= 50
  if (/^Total overdue interest/i.test(trimmed)) score -= 30
  return score
}

function findAmountInWordsCellInWorksheet(worksheet: ExcelJS.Worksheet): ExcelJS.Cell | null {
  const dim = worksheet.dimensions
  if (!dim) return null

  let best: ExcelJS.Cell | null = null
  let bestScore = 0
  for (let row = dim.top; row <= dim.bottom; row += 1) {
    for (let col = dim.left; col <= dim.right; col += 1) {
      const raw = worksheet.getCell(cellRef(row, col))
      if (isMergeSlave(raw)) continue
      const cell = resolveReadCell(raw)
      const score = scoreAmountInWordsCellText(safeCellText(cell))
      if (score > bestScore) {
        bestScore = score
        best = cell
      }
    }
  }
  return bestScore > 0 ? best : null
}

function resolveEditableCell(
  worksheet: ExcelJS.Worksheet,
  address: string,
  change?: { value?: unknown; comment?: string },
): ExcelJS.Cell {
  const valueText = typeof change?.value === 'string' ? change.value : ''
  const commentText = change?.comment ?? ''
  if (
    /SAY\s+U\.?S\.?\s+DOLLARS|AMOUNT\s+IN\s+WORDS|金额\s*大写/i.test(`${valueText}\n${commentText}`)
  ) {
    const wordsCell = findAmountInWordsCellInWorksheet(worksheet)
    if (wordsCell) return wordsCell
  }

  const cell = worksheet.getCell(address)
  let target = resolveReadCell(cell)
  if (cellHasVisibleText(target)) return target

  const { row } = parseCellAddress(address)
  const dim = worksheet.dimensions
  if (dim) {
    let bestCell = target
    let bestLen = safeCellText(target).length
    for (let c = dim.left; c <= dim.right; c += 1) {
      const candidate = resolveReadCell(worksheet.getCell(cellRef(row, c)))
      const len = safeCellText(candidate).length
      if (len > bestLen) {
        bestLen = len
        bestCell = candidate
      }
    }
    if (bestLen > 0) return bestCell
  }

  return target
}

function resolveWorksheet(
  workbook: ExcelJS.Workbook,
  sheetName: string,
): ExcelJS.Worksheet | undefined {
  const trimmed = sheetName.trim()
  const exact = workbook.getWorksheet(trimmed)
  if (exact) return exact

  const lower = trimmed.toLowerCase()
  const caseInsensitive = workbook.worksheets.find(
    (sheet) => sheet.name.toLowerCase() === lower,
  )
  if (caseInsensitive) return caseInsensitive

  if ((trimmed === 'Sheet1' || trimmed === 'sheet1') && workbook.worksheets.length === 1) {
    return workbook.worksheets[0]
  }

  return undefined
}

function applyCellComment(cell: ExcelJS.Cell, comment?: string) {
  const text = comment?.trim()
  if (!text) return
  cell.note = {
    texts: [{ text }],
  }
}

function applyCellHighlight(
  cell: ExcelJS.Cell,
  highlight: { color?: string; comment?: string },
) {
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: toArgb(highlight.color) },
  }
  applyCellComment(cell, highlight.comment)
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

export async function readExcel(args: {
  filePath: string
  sheetName?: string
  range?: string
  maxCells?: number
}) {
  const sourcePath = resolveFilePath(args.filePath)
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(sourcePath)

  const maxCells = Math.max(1, Math.min(args.maxCells ?? 4000, 12000))
  const sheets: Array<{
    name: string
    cellCount: number
    lines: string[]
    merges: string[]
  }> = []

  for (const worksheet of listTargetSheets(workbook, args.sheetName)) {
    const bounds = parseRangeBounds(args.range, worksheet)
    const lines: string[] = []
    let cellCount = 0

    for (let row = bounds.top; row <= bounds.bottom; row += 1) {
      for (let col = bounds.left; col <= bounds.right; col += 1) {
        if (cellCount >= maxCells) break
        const address = cellRef(row, col)
        const cell = worksheet.getCell(address)
        if (isMergeSlave(cell)) continue
        const text = safeCellText(cell)
        if (!text) continue
        const serialized = serializeCellValue(resolveReadCell(cell))
        lines.push(`${address}\t${String(serialized ?? '')}`)
        cellCount += 1
      }
      if (cellCount >= maxCells) break
    }

    const merges = getWorksheetMerges(worksheet)

    sheets.push({
      name: worksheet.name,
      cellCount,
      lines,
      merges,
    })
  }

  return {
    filePath: sourcePath,
    sheets,
    truncated: sheets.some((sheet) => sheet.cellCount >= maxCells),
    hint: 'cell 地址为含文本单元格；合并区域见 merges，修改/高亮应使用合并区左上角主单元格或含文本的单元格地址',
  }
}

export async function reviewExcel(args: {
  filePath: string
  sheetName?: string
  range?: string
  checks?: ReviewCheck[]
}) {
  const sourcePath = resolveFilePath(args.filePath)
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(sourcePath)

  const checks = args.checks?.length ? args.checks : REVIEW_CHECKS
  const issues: ReviewIssue[] = []
  const summary = {
    filePath: sourcePath,
    sheetsScanned: 0,
    cellsScanned: 0,
    issueCount: 0,
    byCheck: Object.fromEntries(checks.map((check) => [check, 0])) as Record<ReviewCheck, number>,
  }

  for (const worksheet of listTargetSheets(workbook, args.sheetName)) {
    summary.sheetsScanned += 1
    const bounds = parseRangeBounds(args.range, worksheet)
    const valueMap = new Map<string, Array<{ cell: string; sheet: string }>>()

    const merges = (worksheet as ExcelJS.Worksheet & { model?: { merges?: string[] } }).model
      ?.merges
    if (checks.includes('merged_cells') && merges?.length) {
      for (const merge of merges) {
        issues.push({
          sheet: worksheet.name,
          cell: merge,
          check: 'merged_cells',
          severity: 'info',
          message: '合并单元格区域，修改时请注意主单元格位置',
        })
        summary.byCheck.merged_cells += 1
      }
    }

    for (let row = bounds.top; row <= bounds.bottom; row += 1) {
      for (let col = bounds.left; col <= bounds.right; col += 1) {
        const address = cellRef(row, col)
        const cell = worksheet.getCell(address)
        if (isMergeSlave(cell)) continue

        summary.cellsScanned += 1
        const readCell = resolveReadCell(cell)
        const currentValue = serializeCellValue(readCell)
        const rawValue = readCell.value

        if (checks.includes('empty')) {
          const text = safeCellText(readCell)
          if (text === '' && rawValue == null) {
            issues.push({
              sheet: worksheet.name,
              cell: readCell.address,
              check: 'empty',
              severity: 'info',
              message: '单元格为空',
              currentValue: null,
            })
            summary.byCheck.empty += 1
          }
        }

        if (checks.includes('formula_error') && isFormulaError(readCell)) {
          issues.push({
            sheet: worksheet.name,
            cell: readCell.address,
            check: 'formula_error',
            severity: 'error',
            message: `公式错误: ${safeCellText(readCell) || '未知错误'}`,
            currentValue,
          })
          summary.byCheck.formula_error += 1
        }

        if (checks.includes('numbers_as_text') && looksNumericText(rawValue)) {
          issues.push({
            sheet: worksheet.name,
            cell: readCell.address,
            check: 'numbers_as_text',
            severity: 'warning',
            message: '数字以文本形式存储，可能导致计算异常',
            currentValue,
          })
          summary.byCheck.numbers_as_text += 1
        }

        if (checks.includes('duplicate_values')) {
          const key = `${worksheet.name}:${String(currentValue)}`
          if (currentValue != null && String(currentValue).trim() !== '') {
            const bucket = valueMap.get(key) ?? []
            bucket.push({ cell: readCell.address, sheet: worksheet.name })
            valueMap.set(key, bucket)
          }
        }
      }
    }

    if (checks.includes('duplicate_values')) {
      for (const [, bucket] of valueMap) {
        if (bucket.length <= 1) continue
        for (const item of bucket) {
          const dupCell = resolveReadCell(worksheet.getCell(item.cell))
          const dupValue = serializeCellValue(dupCell)
          issues.push({
            sheet: item.sheet,
            cell: item.cell,
            check: 'duplicate_values',
            severity: 'warning',
            message: `重复值出现 ${bucket.length} 次: ${dupValue}`,
            currentValue: dupValue,
          })
          summary.byCheck.duplicate_values += 1
        }
      }
    }
  }

  summary.issueCount = issues.length
  return { summary, issues }
}

async function modifyExcelCells(args: {
  filePath: string
  outputPath?: string
  changes: Array<{
    sheet: string
    cell: string
    value?: string | number | boolean | null
    formula?: string
    comment?: string
  }>
}) {
  if (!args.changes.length) {
    throw new Error('changes 不能为空')
  }

  const { sourcePath, targetPath, workbook } = await prepareWorkbookTarget(
    args.filePath,
    args.outputPath,
  )

  const applied: Array<{
    sheet: string
    cell: string
    resolvedCell: string
    status: 'updated' | 'skipped'
    reason?: string
    commented: boolean
  }> = []

  for (const change of args.changes) {
    const sheetName = change.sheet.trim()
    const address = normalizeCellAddress(change.cell)
    const worksheet = resolveWorksheet(workbook, sheetName)
    if (!worksheet) {
      applied.push({
        sheet: sheetName,
        cell: address,
        resolvedCell: address,
        status: 'skipped',
        reason: '工作表不存在',
        commented: false,
      })
      continue
    }

    if (change.value === undefined && !change.formula?.trim()) {
      applied.push({
        sheet: worksheet.name,
        cell: address,
        resolvedCell: address,
        status: 'skipped',
        reason: '未提供 value 或 formula',
        commented: false,
      })
      continue
    }

    const cell = resolveEditableCell(worksheet, address, change)
    const resolvedAddress = cell.address
    applyCellModification(cell, change)
    applyCellComment(cell, change.comment)
    applied.push({
      sheet: worksheet.name,
      cell: address,
      resolvedCell: resolvedAddress,
      status: 'updated',
      commented: Boolean(change.comment?.trim()),
    })
  }

  await saveWorkbook(workbook, targetPath)

  return {
    sourcePath,
    targetPath,
    modifiedInPlace: targetPath === sourcePath,
    applied,
    updatedCount: applied.filter((item) => item.status === 'updated').length,
  }
}

async function highlightExcelCells(args: {
  filePath: string
  outputPath?: string
  highlights: Array<{
    sheet: string
    cell: string
    color?: string
    comment?: string
  }>
}) {
  if (!args.highlights.length) {
    throw new Error('highlights 不能为空')
  }

  const { sourcePath, targetPath, workbook } = await prepareWorkbookTarget(
    args.filePath,
    args.outputPath,
  )

  const applied: Array<{
    sheet: string
    cell: string
    resolvedCell: string
    color: string
    commented: boolean
    status: 'updated' | 'skipped'
    reason?: string
  }> = []

  for (const highlight of args.highlights) {
    const sheetName = highlight.sheet.trim()
    const address = normalizeCellAddress(highlight.cell)
    const worksheet = resolveWorksheet(workbook, sheetName)
    if (!worksheet) {
      applied.push({
        sheet: sheetName,
        cell: address,
        resolvedCell: address,
        color: toArgb(highlight.color),
        commented: false,
        status: 'skipped',
        reason: '工作表不存在',
      })
      continue
    }

    const cell = resolveEditableCell(worksheet, address, { comment: highlight.comment })
    const resolvedAddress = cell.address
    const color = toArgb(highlight.color)
    applyCellHighlight(cell, highlight)
    applied.push({
      sheet: worksheet.name,
      cell: address,
      resolvedCell: resolvedAddress,
      color,
      commented: Boolean(highlight.comment?.trim()),
      status: 'updated',
    })
  }

  await saveWorkbook(workbook, targetPath)

  return {
    sourcePath,
    targetPath,
    modifiedInPlace: targetPath === sourcePath,
    applied,
    highlightedCount: applied.filter((item) => item.status === 'updated').length,
  }
}

function wrapTool<T extends unknown[]>(handler: (...args: T) => Promise<unknown>) {
  return async (...args: T) => {
    try {
      return toolText(await handler(...args))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return toolText(`Error: ${message}`)
    }
  }
}

async function main() {
  const server = new McpServer(
    {
      name: 'excel-mcp-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    },
  )

  server.registerTool(
    'read_excel',
    {
      title: 'Read Excel',
      description:
        '只读导出 Excel 非空单元格（地址与文本/数值），供审查金额、措辞与公式引用；不修改文件。',
      inputSchema: {
        filePath: z.string().describe('Excel 文件绝对或相对路径 (.xlsx)'),
        sheetName: z.string().optional().describe('仅读取指定工作表；省略则读取全部可见工作表'),
        range: z.string().optional().describe('可选范围，如 A1:Z200'),
        maxCells: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('最多导出的非空单元格数量，默认 4000'),
      },
    },
    wrapTool(readExcel),
  )

  server.registerTool(
    'review_excel',
    {
      title: 'Review Excel',
      description:
        '无损只读审核 Excel：扫描空单元格、公式错误、重复值、文本型数字与合并单元格，返回结构化 issue 列表。',
      inputSchema: {
        filePath: z.string().describe('Excel 文件绝对或相对路径 (.xlsx)'),
        sheetName: z.string().optional().describe('仅审核指定工作表；省略则扫描全部可见工作表'),
        range: z.string().optional().describe('可选范围，如 A1:Z200；省略则使用工作表已用区域'),
        checks: z
          .array(
            z.enum([
              'empty',
              'formula_error',
              'duplicate_values',
              'numbers_as_text',
              'merged_cells',
            ]),
          )
          .optional()
          .describe('要执行的检查项，默认全部'),
      },
    },
    wrapTool(reviewExcel),
  )

  server.registerTool(
    'modify_excel_cells',
    {
      title: 'Modify Excel Cells',
      description:
        '无损修改单元格：仅更新 value 或 formula，不重置字体/边框/对齐等既有样式。可指定 outputPath 生成副本。',
      inputSchema: {
        filePath: z.string().describe('源 Excel 文件路径'),
        outputPath: z
          .string()
          .optional()
          .describe('输出路径；省略则原地覆盖保存（建议审核场景使用副本路径）'),
        changes: z
          .array(
            z.object({
              sheet: z.string().describe('工作表名称'),
              cell: z.string().describe('单元格地址，如 B3'),
              value: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
              formula: z.string().optional().describe('公式内容，可带或不带前导 ='),
              comment: z.string().optional().describe('可选批注，写入单元格 note'),
            }),
          )
          .min(1),
      },
    },
    wrapTool(modifyExcelCells),
  )

  server.registerTool(
    'highlight_excel_cells',
    {
      title: 'Highlight Excel Cells',
      description:
        '无损高亮审核：为指定单元格设置填充色与可选批注，保留其他格式。默认高亮色为黄色 (FFFF00)。',
      inputSchema: {
        filePath: z.string().describe('源 Excel 文件路径'),
        outputPath: z.string().optional().describe('输出路径；省略则原地覆盖保存'),
        highlights: z
          .array(
            z.object({
              sheet: z.string(),
              cell: z.string(),
              color: z
                .string()
                .optional()
                .describe('RRGGBB 或 AARRGGBB，如 FFFF00 / FFEB3B'),
              comment: z.string().optional().describe('审核批注，写入单元格 note'),
            }),
          )
          .min(1),
      },
    },
    wrapTool(highlightExcelCells),
  )

  const transport = new StdioServerTransport()
  await server.connect(transport)
}

const isDirectRun =
  Boolean(process.argv[1]) &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '')

if (isDirectRun) {
  main().catch((error) => {
    console.error('[excel-mcp-server] fatal:', error)
    process.exit(1)
  })
}
