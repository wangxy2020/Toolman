import type { IpcAlignmentReport } from '@shared/epcCommercialTypes'
import { describe, expect, it } from 'vitest'

import {
  formatDiscoveredFileDescription,
  formatDiscoveredTablesMarkdown,
  formatPeriodApplicationAmount,
  formatStep2FileLine,
  formatStep3FileLine,
  formatStep4FileLine,
  formatWorkflowStepFooterLine,
  getStep2FooterParts,
  getStep3FooterParts,
  getStep4FooterParts,
  getStep5FooterParts,
  isWork4NoPendingIdleRun,
  work4RequiresDiagnosticAnalysis,
  formatWorkflowStepFooterMarkdown,
  deriveCanonicalAlignedPath,
  getStep5OutputPaths
} from '../epcCommercialReportUtils'

const baseReport = (): IpcAlignmentReport => ({
  processedAt: '2026-01-01T00:00:00.000Z',
  ipcRootPath: '/ws',
  masterPricePath: '/ws/BOQ.xlsx',
  period: 'IPC4',
  successCount: 0,
  skippedCount: 0,
  failedCount: 0,
  files: [],
  discoveredFiles: []
})

const discoveredBase = {
  fileName: 'IPC004.xlsx',
  filePath: '/ws/IPC004.xlsx',
  relativePath: 'IPC004.xlsx',
  folderPath: '.',
  role: 'ipcProgress' as const,
  roleReason: 'IPC 工程量清单（含项目编号、SCH/Schedule 与 IPC4，可含日期）',
  inLedger: false
}

describe('formatDiscoveredFileDescription', () => {
  it('shows completion time for already processed queue', () => {
    const text = formatDiscoveredFileDescription({
      ...discoveredBase,
      queue: 'alreadyProcessed',
      inLedger: true,
      ledgerProcessedAt: '2026-05-20T08:30:00.000Z'
    })
    expect(text).toMatch(/^处理完成：/)
    expect(text).toContain('2026')
  })

  it('shows last processed date for not required when ledger exists', () => {
    const text = formatDiscoveredFileDescription({
      ...discoveredBase,
      queue: 'notRequired',
      inLedger: false,
      ledgerProcessedAt: '2026-04-01T12:00:00.000Z'
    })
    expect(text).toMatch(/^上一次处理：/)
  })

  it('falls back to role reason for not required without ledger', () => {
    const reason = '文件名未含 IPC 期号（如 IPC4、IPC007），无需处理'
    expect(
      formatDiscoveredFileDescription({
        ...discoveredBase,
        role: 'ignored',
        roleReason: reason,
        queue: 'notRequired',
        inLedger: false
      })
    ).toBe(reason)
  })

  it('renders table description column via formatter', () => {
    const lines = formatDiscoveredTablesMarkdown([
      {
        ...discoveredBase,
        queue: 'alreadyProcessed',
        inLedger: true,
        ledgerProcessedAt: '2026-05-20T08:30:00.000Z'
      }
    ])
    const row = lines.find((l) => l.includes('IPC004.xlsx'))
    expect(row).toBeDefined()
    expect(row).toContain('处理完成：')
    expect(row).not.toContain('IPC 工程量清单')
  })
})

describe('formatPeriodApplicationAmount', () => {
  it('formats currency before amount', () => {
    expect(formatPeriodApplicationAmount(2708467776.58, 'TZS')).toBe('本期完成（申请）金额：TZS 2,708,467,776.58')
  })
})

describe('workflow step status', () => {
  it('step 2 fails when any IPC analysis fails even if one succeeded', () => {
    const report: IpcAlignmentReport = {
      ...baseReport(),
      successCount: 1,
      failedCount: 2,
      files: [
        {
          fileName: 'IPC002.xlsx',
          filePath: '/ws/IPC002.xlsx',
          status: 'success',
          analysisOk: true,
          mergeOk: true,
          cleanedRowCount: 10,
          cleanedTotalAmount: 1000,
          cleanedCurrency: 'USD'
        },
        {
          fileName: 'IPC004.xlsx',
          filePath: '/ws/IPC004.xlsx',
          status: 'failed',
          analysisOk: false,
          errorMessage: '缺少 Current 列'
        },
        {
          fileName: 'IPC007.xlsx',
          filePath: '/ws/IPC007.xlsx',
          status: 'failed',
          analysisOk: false,
          errorMessage: '无法识别表头'
        }
      ]
    }
    expect(getStep2FooterParts(report).ok).toBe(false)
    expect(formatWorkflowStepFooterLine(2, report)).toContain('**失败。**')
    expect(formatWorkflowStepFooterLine(2, report)).toContain('分析失败')
  })

  it('step 2 shows error message when analysisOk is unset but error exists', () => {
    const line = formatStep2FileLine({
      fileName: 'IPC007.xlsx',
      filePath: '/ws/IPC007.xlsx',
      status: 'failed',
      errorMessage: '未找到与该 IPC 同目录树下的合同母表'
    })
    expect(line).toContain('分析失败')
    expect(line).toContain('合同母表')
  })

  it('step 2 uses filename and row count without period amount', () => {
    const fileName = 'TBEA-TAZASS-LOT 1-IRI-SCH 4-2025002(IPC004-Iringa)(TZS).xlsx'
    const line = formatStep2FileLine({
      fileName,
      filePath: `/ws/${fileName}`,
      status: 'success',
      analysisOk: true,
      cleanedRowCount: 42,
      analysisRowErrorCount: 0
    })
    expect(line).toContain(fileName)
    expect(line).toContain('**42**')
    expect(line).toContain('无行级错误')
    expect(line).not.toContain('本期完成')
  })

  it('step 3 fails when reconciliationOk is false but step 2 can succeed', () => {
    const fileName = 'IPC004.xlsx'
    const report: IpcAlignmentReport = {
      ...baseReport(),
      successCount: 0,
      failedCount: 1,
      files: [
        {
          fileName,
          filePath: `/ws/${fileName}`,
          status: 'failed',
          analysisOk: true,
          mergeOk: false,
          reconciliationOk: false,
          cleanedRowCount: 10,
          cleanedTotalAmount: 100,
          boqValueTotal: 200,
          cleanedCurrency: 'TZS',
          errorMessage: '明细与 BOQ Value 不一致'
        }
      ]
    }
    expect(getStep2FooterParts(report).ok).toBe(true)
    expect(getStep3FooterParts(report).ok).toBe(false)
    expect(formatStep3FileLine(report.files[0])).toContain('不一致')
  })

  it('step 4 success line is compact', () => {
    const line = formatStep4FileLine({
      fileName: 'IPC004.xlsx',
      filePath: '/ws/IPC004.xlsx',
      status: 'success',
      mergeOk: true,
      mergeTargetSheet: 'Schedule4-TZS',
      mergePeriodColumn: 'IPC4',
      mergeMatchedRows: 27,
      cleanedTotalAmount: 100,
      cleanedCurrency: 'TZS'
    })
    expect(line).toContain('Schedule4-TZS')
    expect(line).toContain('IPC4')
    expect(line).toContain('**27**')
    expect(line).not.toContain('UnitPrice')
  })

  it('step 5 fails when failedCount > 0', () => {
    const report: IpcAlignmentReport = {
      ...baseReport(),
      successCount: 1,
      failedCount: 2,
      files: []
    }
    expect(getStep5FooterParts(report).ok).toBe(false)
  })

  it('getStep5OutputPaths lists aligned masters only', () => {
    const report: IpcAlignmentReport = {
      ...baseReport(),
      outputMasterPath: '/ws/SSLOT1-BOQ.xlsx',
      outputMasterPaths: [
        '/ws/SSLOT1-BOQ_aligned.xlsx',
        '/ws/SSLOT4-BOQ_aligned.xlsx',
        '/ws/SSLOT1-BOQ.xlsx'
      ]
    }
    expect(getStep5OutputPaths(report)).toEqual([
      '/ws/SSLOT1-BOQ_aligned.xlsx',
      '/ws/SSLOT4-BOQ_aligned.xlsx'
    ])
  })

  it('deriveCanonicalAlignedPath appends _aligned suffix', () => {
    expect(deriveCanonicalAlignedPath('/ws/SSLOT1-IRI-BOQ.xlsx')).toBe('/ws/SSLOT1-IRI-BOQ_aligned.xlsx')
  })

  it('getStep5OutputPaths uses engine output paths only', () => {
    const report: IpcAlignmentReport = {
      ...baseReport(),
      outputMasterPaths: ['/ws/SSLOT1-BOQ_aligned.xlsx', '/ws/SSLOT4-BOQ_aligned.xlsx']
    }
    expect(getStep5OutputPaths(report)).toEqual([
      '/ws/SSLOT1-BOQ_aligned.xlsx',
      '/ws/SSLOT4-BOQ_aligned.xlsx'
    ])
  })

  it('steps 2-5 succeed when step 1 has zero pending and no pipeline work', () => {
    const report: IpcAlignmentReport = {
      ...baseReport(),
      discoveredFiles: [
        {
          ...discoveredBase,
          queue: 'alreadyProcessed',
          inLedger: true,
          ledgerProcessedAt: '2026-05-20T08:30:00.000Z'
        }
      ]
    }
    expect(isWork4NoPendingIdleRun(report)).toBe(true)
    expect(getStep2FooterParts(report).ok).toBe(true)
    expect(getStep3FooterParts(report).ok).toBe(true)
    expect(getStep4FooterParts(report).ok).toBe(true)
    expect(getStep5FooterParts(report).ok).toBe(true)
    expect(work4RequiresDiagnosticAnalysis(report)).toBe(false)
    expect(formatWorkflowStepFooterLine(2, report)).toContain('**成功。**')
  })

  it('step 5 success markdown lists files under success line', () => {
    const report: IpcAlignmentReport = {
      ...baseReport(),
      successCount: 2,
      failedCount: 0,
      skippedCount: 0,
      files: [
        {
          fileName: 'a.xlsx',
          filePath: '/ws/a.xlsx',
          status: 'success',
          analysisOk: true,
          reconciliationOk: true,
          mergeOk: true
        },
        {
          fileName: 'b.xlsx',
          filePath: '/ws/b.xlsx',
          status: 'success',
          analysisOk: true,
          reconciliationOk: true,
          mergeOk: true
        }
      ],
      outputMasterPath: '/ws/out/Master-IPC4_aligned.xlsx',
      outputMasterPaths: ['/ws/out/Master-IPC4_aligned.xlsx']
    }
    const lines = formatWorkflowStepFooterMarkdown(5, report)
    expect(lines[0]).toBe('**成功。**')
    expect(lines[1]).toBe('- `/ws/out/Master-IPC4_aligned.xlsx`')
    expect(lines[2]).toBe('')
    expect(lines[3]).toContain('成功 **2**')
  })

  it('renders step 1 table as fixed-layout HTML discovery table', () => {
    const table = formatDiscoveredTablesMarkdown([
      {
        ...discoveredBase,
        queue: 'masterContract',
        roleReason: '合同母表'
      }
    ])
    expect(table[0]).toContain('class="epc-discovery-table"')
    expect(table.join('\n')).toContain('epc-discovery-queue')
    expect(table.join('\n')).toContain('epc-discovery-desc')
  })
})
