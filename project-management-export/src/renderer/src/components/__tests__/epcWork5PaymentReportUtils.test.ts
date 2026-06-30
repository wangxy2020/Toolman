import { describe, expect, it } from 'vitest'

import type { PaymentWorkflowReport } from '@shared/epcCommercialTypes'

import {
  formatStep5OutputFilesMarkdown,
  formatWork5WorkflowStepFooterMarkdown,
  getWork5Step1FooterParts,
  getWork5Step2FooterParts,
  getWork5Step3FooterParts,
  getWork5Step4FooterParts,
  getWork5Step5FooterParts,
  getWork5Step5OutputPaths,
  isWork5NoPendingIdleRun,
  work5RequiresDiagnosticAnalysis
} from '../epcWork5PaymentReportUtils'

const baseReport = (): PaymentWorkflowReport => ({
  processedAt: new Date().toISOString(),
  workspaceRoot: '/test',
  period: 'IPC4',
  successCount: 4,
  skippedCount: 0,
  failedCount: 0,
  discoveredAlignedFiles: [
    {
      fileName: 'SSLOT4 BOQ_aligned.xlsx',
      filePath: '/test/SSLOT4/SSLOT4 BOQ_aligned.xlsx',
      relativePath: 'SSLOT4/SSLOT4 BOQ_aligned.xlsx',
      folderPath: 'SSLOT4',
      queue: 'pendingProcess',
      roleReason: '2 个 Schedule 待写入支付汇总',
      scheduleCount: 2
    },
    {
      fileName: 'SSLOT1-IRI-BOQ_aligned.xlsx',
      filePath: '/test/SSLOT1/SSLOT1-IRI-BOQ_aligned.xlsx',
      relativePath: 'SSLOT1/SSLOT1-IRI-BOQ_aligned.xlsx',
      folderPath: 'SSLOT1',
      queue: 'pendingProcess',
      roleReason: '2 个 Schedule 待写入支付汇总',
      scheduleCount: 2
    }
  ],
  files: [],
  ipcProcessLogPath: '/test/ipc_process_log.txt',
  ipcPaymentDataPath: '/test/IPC_Payment_data/ipc_payment_data.xlsx',
  projectIpcDataPath: '/test/IPC_Payment_data/project_ipc_data.xlsx',
  ipcPaymentLogPath: '/test/ipc_payment_log.txt',
  outputCsvPaths: [
    '/test/IPC_Payment_data/ipc_payment_data.csv',
    '/test/IPC_Payment_data/project_ipc_data.csv'
  ]
})

describe('epcWork5PaymentReportUtils step 5', () => {
  it('lists only xlsx paths for links', () => {
    const report = baseReport()
    expect(getWork5Step5OutputPaths(report)).toEqual([
      '/test/IPC_Payment_data/ipc_payment_data.xlsx',
      '/test/IPC_Payment_data/project_ipc_data.xlsx'
    ])
    expect(formatStep5OutputFilesMarkdown(report)).toEqual([
      '- `/test/IPC_Payment_data/ipc_payment_data.xlsx`',
      '- `/test/IPC_Payment_data/project_ipc_data.xlsx`'
    ])
  })

  it('step 5 footer distinguishes excel outputs from processed file count', () => {
    const report = baseReport()
    const { ok, detail } = getWork5Step5FooterParts(report)
    expect(ok).toBe(true)
    expect(detail).toContain('已生成 **2** 个 Excel 汇总表')
    expect(detail).toContain('成功处理 **4** 个文件')
    expect(detail).not.toContain('4 个输出已生成')
  })

  it('step 5 success markdown separates stats from file list', () => {
    const report = baseReport()
    const lines = formatWork5WorkflowStepFooterMarkdown(5, report)
    const statsIndex = lines.findIndex((line) => line.includes('已生成 **2** 个 Excel 汇总表'))
    expect(statsIndex).toBeGreaterThan(0)
    expect(lines[statsIndex - 1]).toBe('')
    const joined = lines.join('\n')
    expect(joined).toContain('project_ipc_data.xlsx`\n\n已生成')
  })

  it('step 1 counts aligned workbooks not processing units', () => {
    const report = baseReport()
    const { ok, detail } = getWork5Step1FooterParts(report)
    expect(ok).toBe(true)
    expect(detail).toContain('2 个 aligned 工程量清单')
    expect(detail).toContain('待处理 2')
    expect(detail).toContain('ipc_process_log')
    expect(detail).toContain('ipc_payment_log')
  })

  it('steps 2-5 succeed when step 1 has zero pending and no pipeline work', () => {
    const report: PaymentWorkflowReport = {
      ...baseReport(),
      successCount: 0,
      skippedCount: 0,
      failedCount: 0,
      files: [],
      discoveredAlignedFiles: [
        {
          fileName: 'SSLOT4 BOQ_aligned.xlsx',
          filePath: '/test/SSLOT4/SSLOT4 BOQ_aligned.xlsx',
          relativePath: 'SSLOT4/SSLOT4 BOQ_aligned.xlsx',
          folderPath: 'SSLOT4',
          queue: 'alreadyProcessed',
          roleReason: '已写入支付汇总',
          scheduleCount: 2
        }
      ],
      ipcPaymentDataPath: '/test/IPC_Payment_data/ipc_payment_data.xlsx',
      projectIpcDataPath: '/test/IPC_Payment_data/project_ipc_data.xlsx'
    }
    expect(isWork5NoPendingIdleRun(report)).toBe(true)
    expect(getWork5Step2FooterParts(report).ok).toBe(true)
    expect(getWork5Step3FooterParts(report).ok).toBe(true)
    expect(getWork5Step4FooterParts(report).ok).toBe(true)
    expect(getWork5Step5FooterParts(report).ok).toBe(true)
    expect(getWork5Step5FooterParts(report).detail).toContain('无新增写出 Excel 汇总表')
    expect(work5RequiresDiagnosticAnalysis(report)).toBe(false)
    const step5Lines = formatWork5WorkflowStepFooterMarkdown(5, report)
    expect(step5Lines).toEqual([
      '**成功。** 本次无待处理 aligned 文件，无新增写出 Excel 汇总表'
    ])
  })
})
