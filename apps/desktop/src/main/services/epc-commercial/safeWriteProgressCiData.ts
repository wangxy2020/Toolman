import fs from 'node:fs/promises'
import path from 'node:path'

import ExcelJS from 'exceljs'

import { loggerService } from './epc-logger.js'
import { sanitiseWorkbookSharedFormulas } from './exceljsSharedFormulaSanitise'
import {
  clearDataRegion,
  detectInvoiceLayout,
  findFirstItemRow,
  findSummaryStartRow,
  isFileLockedError,
  pickCommercialInvoiceWorksheet,
} from './safeWriteProgressCiLayout.js'
import { round2 } from './safeWriteProgressCiExcelUtils.js'
import { insertRowsPreservingMerges, shiftImageAnchors } from './safeWriteProgressCiExcelMutations.js'
import {
  applyCurrencyToHeaderRow,
  isSectionRow,
  rewriteSummarySection,
  updateAmountInWords,
  updateInvoiceHeaderFields,
  writeInvoiceRows,
} from './safeWriteProgressCiInvoiceWrite.js'
import {
  SafeWriteProgressCiDataError,
  type SafeWriteProgressCiDataParams,
} from './safeWriteProgressCiTypes.js'

export {
  SafeWriteProgressCiDataError,
  type SafeWriteProgressCiDataParams,
  type SafeWriteProgressCiRowWrite,
} from './safeWriteProgressCiTypes.js'

const logger = loggerService.withContext('SafeWriteProgressCiData')

export async function safeWriteProgressCiData(params: SafeWriteProgressCiDataParams): Promise<void> {
  const { outputPath, periodColumnHeader, schDigit, currency, batchNumber, rows } = params
  const absolutePath = path.resolve(outputPath)
  const dir = path.dirname(absolutePath)
  const base = path.basename(absolutePath)
  const tempPath = path.join(dir, `.~${base}.${process.pid}.tmp.xlsx`)

  try {
    await fs.copyFile(absolutePath, tempPath)
  } catch (error) {
    throw new SafeWriteProgressCiDataError(
      `无法创建备份副本: ${absolutePath}`,
      isFileLockedError(error) ? 'FILE_LOCKED' : 'INTERNAL_ERROR',
      error
    )
  }

  try {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(tempPath)
    sanitiseWorkbookSharedFormulas(workbook)
    const worksheet = pickCommercialInvoiceWorksheet(workbook)
    if (!worksheet) {
      throw new SafeWriteProgressCiDataError('工作簿无可用工作表', 'INTERNAL_ERROR')
    }

    const layout = detectInvoiceLayout(worksheet)
    if (!layout) {
      throw new SafeWriteProgressCiDataError(
        '无法识别进度款商业发票表头（需含 Item 与 Unit Price / Total Price 列）',
        'INTERNAL_ERROR'
      )
    }

    const summaryStartRow = findSummaryStartRow(worksheet, layout.dataStartRow)
    const dataEndRow = summaryStartRow !== null ? summaryStartRow - 1 : worksheet.rowCount
    const writeStartRow = findFirstItemRow(worksheet, layout, dataEndRow)

    clearDataRegion(worksheet, layout, layout.dataStartRow, dataEndRow)

    let inserted = 0
    if (summaryStartRow !== null) {
      const available = summaryStartRow - writeStartRow
      if (rows.length > available) {
        inserted = rows.length - available
        insertRowsPreservingMerges(worksheet, summaryStartRow, inserted, summaryStartRow - 1)
        shiftImageAnchors(worksheet, summaryStartRow, inserted)
      }
    }

    const written = writeInvoiceRows(worksheet, layout, rows, writeStartRow)
    const boqValue = rows.reduce((sum, row) => (isSectionRow(row) ? sum : sum + row.currentTotalPrice), 0)

    if (summaryStartRow !== null) {
      const newSummaryStart = summaryStartRow + inserted
      const totalToBePaid = rewriteSummarySection(
        worksheet,
        layout,
        newSummaryStart,
        writeStartRow,
        newSummaryStart - 1,
        boqValue
      )
      if (totalToBePaid !== null) {
        updateAmountInWords(worksheet, totalToBePaid, currency)
      }
    }

    updateInvoiceHeaderFields(worksheet, layout.headerRow, {
      schDigit,
      batchNumber,
      period: periodColumnHeader
    })
    applyCurrencyToHeaderRow(worksheet, layout.headerRow, currency)

    workbook.calcProperties = { ...workbook.calcProperties, fullCalcOnLoad: true }

    logger.info('safeWriteProgressCiData rows written', {
      outputPath: absolutePath,
      periodColumnHeader,
      written,
      requested: rows.length,
      inserted,
      boqValue: round2(boqValue)
    })

    await workbook.xlsx.writeFile(tempPath)
    await fs.rename(tempPath, absolutePath)
  } catch (error) {
    await fs.unlink(tempPath).catch(() => undefined)
    if (error instanceof SafeWriteProgressCiDataError) {
      throw error
    }
    throw new SafeWriteProgressCiDataError(
      isFileLockedError(error)
        ? `文件被占用或无法写入，请关闭 Excel 后重试: ${absolutePath}`
        : `写入失败: ${error instanceof Error ? error.message : String(error)}`,
      isFileLockedError(error) ? 'FILE_LOCKED' : 'INTERNAL_ERROR',
      error
    )
  }
}