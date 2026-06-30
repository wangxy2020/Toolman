import { describe, expect, it } from 'vitest'

import type { BoqFormatWorkflowReport } from '@shared/epcCommercialTypes'

import { EPC_DISCOVERY_TABLE_CLASS } from '../epcDiscoveryTable'
import {
  formatWork1Step1Section,
  formatWork1Steps2to5Markdown,
  formatWork1WorkflowStepFooterMarkdown,
  getWork1Step5OutputPaths,
  getWork1Step1FooterParts,
  isWork1NoPendingIdleRun,
  work1RequiresDiagnosticAnalysis,
  WORK1_IDLE_STEPS_DETAIL
} from '../epcWork1BoqFormatReportUtils'

describe('epcWork1BoqFormatReportUtils', () => {
  it('renders step 1 discovery as epc-discovery-table HTML', () => {
    const report: BoqFormatWorkflowReport = {
      processedAt: '2026-01-01T00:00:00Z',
      workspaceRoot: '/tmp/ws',
      successCount: 0,
      skippedCount: 0,
      failedCount: 0,
      discoveredFiles: [
        {
          fileName: 'p1_boq_original.xlsx',
          filePath: '/tmp/ws/p1/p1_boq_original.xlsx',
          relativePath: 'p1/p1_boq_original.xlsx',
          folderPath: 'p1',
          roleReason: 'MasterContract',
          projectName: 'P1',
          queue: 'pendingProcess',
          inLedger: false
        }
      ],
      files: [],
      outputPaths: [],
      boqFormatProcessLogPath: '/tmp/ws/boq_format_process_log.txt'
    }

    const section = formatWork1Step1Section(report)
    expect(section).toContain(`class="${EPC_DISCOVERY_TABLE_CLASS}"`)
    expect(section).toContain('p1_boq_original.xlsx')
    expect(section).toContain('**成功。**')
    expect(section).toContain('boq_format_process_log.txt：已读取')
    expect(section).not.toMatch(/\| --- \| --- \|/)
  })

  it('step 1 succeeds with summary when all originals are already processed', () => {
    const report: BoqFormatWorkflowReport = {
      processedAt: '2026-01-01T00:00:00Z',
      workspaceRoot: '/tmp/ws',
      successCount: 0,
      skippedCount: 2,
      failedCount: 0,
      discoveredFiles: [
        {
          fileName: 'A_original.xlsx',
          filePath: '/tmp/ws/A_original.xlsx',
          relativePath: 'A_original.xlsx',
          folderPath: '.',
          roleReason: '原始合同价格表',
          queue: 'alreadyProcessed',
          inLedger: true,
          ledgerProcessedAt: '2026-05-20T08:30:00.000Z'
        },
        {
          fileName: 'B_original.xlsx',
          filePath: '/tmp/ws/B_original.xlsx',
          relativePath: 'B_original.xlsx',
          folderPath: '.',
          roleReason: '原始合同价格表',
          queue: 'alreadyProcessed',
          inLedger: true,
          ledgerProcessedAt: '2026-05-20T09:00:00.000Z'
        }
      ],
      files: [],
      outputPaths: [],
      boqFormatProcessLogPath: '/tmp/ws/boq_format_process_log.txt'
    }

    const footer = getWork1Step1FooterParts(report)
    expect(footer.ok).toBe(true)
    expect(footer.detail).toContain('2 个合同价格表')
    expect(footer.detail).toContain('待处理 0')
    expect(footer.detail).toContain('已处理 2')
    expect(footer.detail).not.toContain('未发现')

    const section = formatWork1Step1Section(report)
    expect(section).toContain('**成功。**')
    expect(section).not.toContain('（未发现')
  })

  it('step 1 failure uses engine message without extra parenthetical footer', () => {
    const report: BoqFormatWorkflowReport = {
      processedAt: '2026-01-01T00:00:00Z',
      workspaceRoot: '/tmp/ws',
      successCount: 0,
      skippedCount: 0,
      failedCount: 0,
      discoveredFiles: [],
      files: [],
      outputPaths: [],
      boqFormatProcessLogPath: '/tmp/ws/boq_format_process_log.txt'
    }
    const engineMsg = '未发现 *_original.xlsx 原始合同价格表，请确认工作区存在源表且未被误删'
    const footer = getWork1Step1FooterParts(report, engineMsg)
    expect(footer.ok).toBe(false)
    expect(footer.detail).toBe(engineMsg)
    expect(formatWork1Step1Section(report, engineMsg)).not.toMatch(/失败。\s*[^*]*（[^）]+）/)
  })

  it('steps 2-5 succeed with idle detail when step 1 has zero pending and no pipeline work', () => {
    const report: BoqFormatWorkflowReport = {
      processedAt: '2026-01-01T00:00:00Z',
      workspaceRoot: '/tmp/ws',
      successCount: 0,
      skippedCount: 2,
      failedCount: 0,
      discoveredFiles: [
        {
          fileName: 'SSLOT1-IRI-BOQ_original.xlsx',
          filePath: '/tmp/ws/SSLOT1-IRI-BOQ_original.xlsx',
          relativePath: 'SSLOT1-IRI-BOQ_original.xlsx',
          folderPath: '.',
          roleReason: '已处理',
          queue: 'alreadyProcessed',
          inLedger: true,
          ledgerProcessedAt: '2026-05-20T08:30:00.000Z'
        },
        {
          fileName: 'SSLOT4-BOQ_original.xlsx',
          filePath: '/tmp/ws/SSLOT4-BOQ_original.xlsx',
          relativePath: 'SSLOT4-BOQ_original.xlsx',
          folderPath: '.',
          roleReason: '已处理',
          queue: 'alreadyProcessed',
          inLedger: true,
          ledgerProcessedAt: '2026-05-20T09:00:00.000Z'
        }
      ],
      files: [
        {
          fileName: 'SSLOT1-IRI-BOQ_original.xlsx',
          filePath: '/tmp/ws/SSLOT1-IRI-BOQ_original.xlsx',
          status: 'skipped',
          skippedReason: 'boq_format_process_log.txt 已记录 SUCCESS'
        },
        {
          fileName: 'SSLOT4-BOQ_original.xlsx',
          filePath: '/tmp/ws/SSLOT4-BOQ_original.xlsx',
          status: 'skipped',
          skippedReason: 'boq_format_process_log.txt 已记录 SUCCESS'
        }
      ],
      outputPaths: [],
      boqFormatProcessLogPath: '/tmp/ws/boq_format_process_log.txt'
    }

    expect(isWork1NoPendingIdleRun(report)).toBe(true)
    expect(work1RequiresDiagnosticAnalysis(report)).toBe(false)

    const stepsMd = formatWork1Steps2to5Markdown(report).join('\n')
    expect(stepsMd).toContain(WORK1_IDLE_STEPS_DETAIL)
    expect(formatWork1WorkflowStepFooterMarkdown(2, report)[0]).toContain('**成功。**')
    expect(formatWork1WorkflowStepFooterMarkdown(2, report)[0]).toContain(WORK1_IDLE_STEPS_DETAIL)

    const step5 = formatWork1WorkflowStepFooterMarkdown(5, report).join('\n')
    expect(step5).toContain('**成功。**')
    expect(step5).toContain('无新增写出格式化 BOQ')
    expect(step5).not.toContain('`/tmp/ws/')
  })

  it('step 5 lists xlsx outputs only, not csv', () => {
    const report: BoqFormatWorkflowReport = {
      processedAt: '2026-01-01T00:00:00Z',
      workspaceRoot: '/tmp/ws',
      successCount: 1,
      skippedCount: 0,
      failedCount: 0,
      discoveredFiles: [
        {
          fileName: 'SSLOT1-IRI-BOQ_original.xlsx',
          filePath: '/tmp/ws/SSLOT1-IRI-BOQ_original.xlsx',
          relativePath: 'SSLOT1-IRI-BOQ_original.xlsx',
          folderPath: '',
          roleReason: '原始合同价格表',
          projectName: 'SSLOT1',
          queue: 'pendingProcess',
          inLedger: false
        }
      ],
      files: [
        {
          fileName: 'SSLOT1-IRI-BOQ_original.xlsx',
          filePath: '/tmp/ws/SSLOT1-IRI-BOQ_original.xlsx',
          status: 'success',
          outputPath: '/tmp/ws/SSLOT1-IRI-BOQ.xlsx',
          outputCsvPath: '/tmp/ws/SSLOT1-IRI-BOQ.csv'
        }
      ],
      outputPaths: ['/tmp/ws/SSLOT1-IRI-BOQ.xlsx', '/tmp/ws/SSLOT1-IRI-BOQ.csv'],
      boqFormatProcessLogPath: '/tmp/ws/boq_format_process_log.txt'
    }

    expect(getWork1Step5OutputPaths(report)).toEqual(['/tmp/ws/SSLOT1-IRI-BOQ.xlsx'])

    const step5 = formatWork1WorkflowStepFooterMarkdown(5, report).join('\n')
    expect(step5).toContain('`/tmp/ws/SSLOT1-IRI-BOQ.xlsx`')
    expect(step5).not.toContain('.csv')
  })
})
