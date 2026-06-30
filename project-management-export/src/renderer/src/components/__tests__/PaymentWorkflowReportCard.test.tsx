import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import PaymentWorkflowReportCard from '../PaymentWorkflowReportCard'
import type { EpcWork5PaymentReportPayload } from '../epcWork5PaymentMessage'

vi.mock('../EpcOutputPathLink', () => ({
  EpcOutputPathLink: ({ path }: { path: string }) => <span>{path}</span>
}))

const baseReport = {
  processedAt: new Date().toISOString(),
  workspaceRoot: '/tmp/workspace',
  period: 'IPC4',
  successCount: 0,
  skippedCount: 1,
  failedCount: 0,
  discoveredAlignedFiles: [],
  files: [],
  ipcProcessLogPath: '/tmp/workspace/ipc_process_log.txt',
  ipcPaymentDataPath: '/tmp/workspace/ipc_payment_data.xlsx',
  projectIpcDataPath: '/tmp/workspace/project_ipc_data.xlsx',
  ipcPaymentLogPath: '/tmp/workspace/ipc_payment_log.txt',
  outputCsvPaths: []
}

describe('PaymentWorkflowReportCard', () => {
  it('renders error-only payload then full report without hooks violation', () => {
    const errorPayload: EpcWork5PaymentReportPayload = {
      kind: 'error',
      errorMessage: '引擎失败'
    }
    const { rerender, getByText } = render(<PaymentWorkflowReportCard payload={errorPayload} />)
    expect(getByText('引擎失败')).toBeInTheDocument()

    const reportPayload: EpcWork5PaymentReportPayload = {
      kind: 'report',
      report: baseReport
    }
    expect(() => rerender(<PaymentWorkflowReportCard payload={reportPayload} />)).not.toThrow()
    expect(getByText(/成功 0/)).toBeInTheDocument()
  })
})
