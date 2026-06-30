import { describe, expect, it } from 'vitest'

import type { ShippingCiWorkflowReport } from '@shared/epcCommercialTypes'

import {
  formatWork2Step2FileLine,
  formatWork2Step2MismatchTableHtml,
  getWork2Step2FooterParts,
  getWork2Step3FooterParts
} from '../epcWork2ShippingCiReportUtils'

const baseReport = (files: ShippingCiWorkflowReport['files']): ShippingCiWorkflowReport => ({
  processedAt: '2026-01-01T00:00:00Z',
  workspaceRoot: '/ws',
  successCount: files.filter((f) => f.status === 'success').length,
  skippedCount: 0,
  failedCount: files.filter((f) => f.status === 'failed').length,
  discoveredFiles: [],
  files,
  outputPaths: [],
  shippingCiProcessLogPath: '/ws/shipping_ci_process_log.txt'
})

describe('Work2 step2 report utils', () => {
  it('shows per-file row counts when analysis passes', () => {
    const report = baseReport([
      {
        fileName: 'CIP-LOT4.xlsx',
        filePath: '/ws/CIP-LOT4.xlsx',
        status: 'success',
        mismatchCount: 0,
        analysisOk: true,
        checkedRowCount: 12,
        matchedRowCount: 12,
        descriptionMatchCount: 0,
        analysisRowErrorCount: 0,
        boqReferenceKind: 'BOQ_aligned',
        boqScheduleDigit: 4
      }
    ])
    const line = formatWork2Step2FileLine(report.files[0])
    expect(line).toContain('12')
    expect(line).toContain('Item 与 BOQ 全部对应')
    expect(getWork2Step2FooterParts(report).ok).toBe(true)
  })

  it('flags description match with item mismatch for manual review', () => {
    const report = baseReport([
      {
        fileName: 'CIP-LOT4.xlsx',
        filePath: '/ws/CIP-LOT4.xlsx',
        status: 'failed',
        mismatchCount: 1,
        analysisOk: false,
        checkedRowCount: 3,
        matchedRowCount: 2,
        descriptionMatchCount: 1,
        analysisRowErrorCount: 0,
        boqReferenceKind: 'BOQ_aligned',
        boqScheduleDigit: 4,
        mismatches: [
          {
            kind: 'descriptionMatchItemMismatch',
            item: '2.01',
            description: 'Concrete',
            reason: 'Description 与 BOQ 一致，但 Item 编号不一致',
            boqItem: '1.01',
            boqDescription: 'Concrete'
          }
        ]
      }
    ])
    const footer = getWork2Step2FooterParts(report)
    expect(footer.ok).toBe(false)
    expect(footer.detail).toContain('人工修复')
    const table = formatWork2Step2MismatchTableHtml(report.files)
    expect(table.some((line) => line.includes('2.01'))).toBe(true)
  })

  it('allows partial step2 success when some files lack BOQ', () => {
    const report = baseReport([
      {
        fileName: 'no-boq.xlsx',
        filePath: '/ws/no-boq.xlsx',
        status: 'failed',
        mismatchCount: 1,
        analysisOk: false,
        mismatches: [
          {
            kind: 'boqNotFound',
            item: '',
            description: '',
            reason: '未找到 BOQ_aligned 或 BOQ.xlsx'
          }
        ]
      },
      {
        fileName: 'ok.xlsx',
        filePath: '/ws/ok.xlsx',
        status: 'success',
        mismatchCount: 0,
        analysisOk: true,
        checkedRowCount: 5,
        matchedRowCount: 5,
        boqReferenceKind: 'BOQ_aligned',
        boqScheduleDigit: 4
      }
    ])
    const footer = getWork2Step2FooterParts(report)
    expect(footer.ok).toBe(true)
    expect(footer.detail).toContain('1/2')
    expect(getWork2Step3FooterParts({ ...report, outputPaths: ['/ws/out.xlsx'] }).ok).toBe(true)
  })
})
