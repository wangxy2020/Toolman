import type { ShippingCiWorkflowExecuteResponse } from '@toolman/shared'

import { rustCommitShippingCiLedger, type RustCommitShippingCiLedgerRequest } from './rustCli'
import { safeWriteIpcData, SafeWriteIpcDataError } from './safeWriteIpcData.js'
import {
  safeWriteProgressCiData,
  SafeWriteProgressCiDataError,
} from './safeWriteProgressCiData.js'

type ShippingCiWriteError = {
  ok: false
  report: ShippingCiWorkflowExecuteResponse['report']
  errorCode: 'FILE_LOCKED' | 'INTERNAL_ERROR'
  errorMessage: string
}

export async function applyShippingCiWriteJobs(
  report: NonNullable<ShippingCiWorkflowExecuteResponse['report']>,
  ledgerRequest: RustCommitShippingCiLedgerRequest,
): Promise<ShippingCiWriteError | null> {
  for (const job of report.progressCiWriteJobs ?? []) {
    try {
      await safeWriteProgressCiData({
        outputPath: job.outputPath,
        periodColumnHeader: job.periodColumnHeader,
        schDigit: job.schDigit,
        currency: job.currency,
        batchNumber: job.batchNumber,
        rows: job.rows.map((row) => ({
          item: row.item,
          description: row.description,
          unit: row.unit,
          estQty: row.estQty,
          unitPrice: row.unitPrice,
          previous: row.previous,
          current: row.current,
          endTotal: row.endTotal,
          proportion: row.proportion,
          currentTotalPrice: row.currentTotalPrice,
        })),
      })
    } catch (error) {
      if (error instanceof SafeWriteProgressCiDataError && error.code === 'FILE_LOCKED') {
        return { ok: false, report, errorCode: 'FILE_LOCKED', errorMessage: error.message }
      }
      return {
        ok: false,
        report,
        errorCode: 'INTERNAL_ERROR',
        errorMessage: error instanceof Error ? error.message : String(error),
      }
    }
  }

  for (const job of report.alignedIpcWriteJobs ?? []) {
    try {
      await safeWriteIpcData({
        masterFilePath: job.masterPath,
        worksheetName: job.worksheetName,
        periodColumnHeader: job.periodColumnHeader,
        rows: job.rows.map((row) => ({
          item: row.item,
          unitPrice: row.unitPrice,
          amount: row.amount,
        })),
      })
    } catch (error) {
      if (error instanceof SafeWriteIpcDataError && error.code === 'FILE_LOCKED') {
        return { ok: false, report, errorCode: 'FILE_LOCKED', errorMessage: error.message }
      }
      return {
        ok: false,
        report,
        errorCode: 'INTERNAL_ERROR',
        errorMessage: error instanceof Error ? error.message : String(error),
      }
    }
  }

  const pendingCommits = report.pendingLedgerCommits ?? []
  if (pendingCommits.length > 0) {
    const commitResult = await rustCommitShippingCiLedger(ledgerRequest)
    if (!commitResult.ok) {
      return {
        ok: false,
        report,
        errorCode: 'INTERNAL_ERROR',
        errorMessage: commitResult.errorMessage ?? '账本 SUCCESS 提交失败',
      }
    }
  }

  return null
}
