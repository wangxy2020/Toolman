import { describe, expect, it } from 'vitest'

import {
  emptyPmRevisionsFile,
  isExplicitEngineOverwriteRequest,
  isProjectManagementAgentName,
  isProjectManagementDataPath,
  PM_REVISIONS_RELATIVE,
  pmRevisionsPath,
  relativePathInWorkspace
} from '../projectManagementRevision'

describe('projectManagementRevision', () => {
  it('uses unified revisions path under workspace', () => {
    expect(pmRevisionsPath('/tmp/ws')).toBe(`/tmp/ws/${PM_REVISIONS_RELATIVE}`)
  })

    it('detects PM cost data paths', () => {
    const root = '/tmp/ws'
    expect(isProjectManagementDataPath(`${root}/IPC_Payment_data/ipc_payment_data.xlsx`, root)).toBe(true)
    expect(isProjectManagementDataPath(`${root}/BOQ_master_aligned.xlsx`, root)).toBe(true)
    expect(isProjectManagementDataPath(`${root}/folder/TAZASSLOT4SCH4IPC002.csv`, root)).toBe(true)
    expect(isProjectManagementDataPath(`${root}/.cherry-studio/project-management/revisions.json`, root)).toBe(true)
    expect(isProjectManagementDataPath(`${root}/random.txt`, root)).toBe(false)
  })

  it('recognizes explicit engine overwrite phrases', () => {
    expect(isExplicitEngineOverwriteRequest('请强制重算支付表')).toBe(true)
    expect(isExplicitEngineOverwriteRequest('SSLOT1 生效日期改为 2026-05-30')).toBe(false)
  })

  it('recognizes project management agent names', () => {
    expect(isProjectManagementAgentName('成本智能体')).toBe(true)
    expect(isProjectManagementAgentName('计划智能体')).toBe(true)
    expect(isProjectManagementAgentName('通用助手')).toBe(false)
  })

  it('computes relative path in workspace', () => {
    expect(relativePathInWorkspace('/tmp/ws', '/tmp/ws/IPC_Payment_data/ipc_payment_data.xlsx')).toBe(
      'IPC_Payment_data/ipc_payment_data.xlsx'
    )
  })

  it('empty revisions file has progress_plan stub domain', () => {
    const file = emptyPmRevisionsFile()
    expect(file.domains.progress_plan.patches).toEqual([])
    expect(file.domains.cost_epc_aligned.cellLocks).toEqual([])
  })
})
