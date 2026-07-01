import { describe, expect, it } from 'vitest'

import {
  buildEffectiveWorkflowUserRequest,
  extractWorkflowInputOverride,
  isEpcWorkflowLogFilePath,
  parseWorkflowLogOverrides,
  workflowLogPathForWork
} from '../epcWorkflowLog'
import { EPC_COMMERCIAL_QUICK_PHRASE_CONTENT } from '../epcCommercialQuickPhrase.js'

describe('epcWorkflowLog', () => {
  it('extracts text beyond quick phrase and command lines', () => {
    const extra = '请将 Schedule2 的合计行 Total Price 优先读缓存数值。'
    const raw = `${EPC_COMMERCIAL_QUICK_PHRASE_CONTENT}\n期数: ipc7\n${extra}`
    expect(
      extractWorkflowInputOverride(raw, EPC_COMMERCIAL_QUICK_PHRASE_CONTENT, {
        stripCommandLines: /^epc\s+\S+\s+to\s+boq\s*$/i
      })
    ).toBe(extra)
  })

  it('returns null when only quick phrase remains', () => {
    expect(extractWorkflowInputOverride(EPC_COMMERCIAL_QUICK_PHRASE_CONTENT, EPC_COMMERCIAL_QUICK_PHRASE_CONTENT)).toBe(
      null
    )
  })

  it('prioritizes log.txt and input over quick phrase in merged request', () => {
    const merged = buildEffectiveWorkflowUserRequest(
      '默认快捷短语说明',
      '# --- 2026-01-01 ---\n历史定制：读 F 列合计',
      '本次：忽略发票表'
    )
    expect(merged).toContain('默认快捷短语说明')
    expect(merged).toContain('历史定制：读 F 列合计')
    expect(merged).toContain('本次：忽略发票表')
    expect(merged.indexOf('历史定制')).toBeLessThan(merged.indexOf('本次：忽略发票表'))
  })

  it('parseWorkflowLogOverrides skips file header comments', () => {
    const body = parseWorkflowLogOverrides(`# header\n# --- 2026-01-01 ---\n定制 A`)
    expect(body).toContain('定制 A')
    expect(body).not.toContain('header')
  })

  it('detects workflow log paths under workspace', () => {
    const root = '/tmp/workspace'
    expect(isEpcWorkflowLogFilePath('/tmp/workspace/log.txt', root)).toBe(true)
    expect(workflowLogPathForWork(root, 'work5')).toBe(`${root}/log.txt`)
    expect(workflowLogPathForWork(root, 'work1')).toBe(`${root}/log.txt`)
    expect(isEpcWorkflowLogFilePath('/tmp/workspace/IPC_Payment_data/log.txt', root)).toBe(false)
    expect(isEpcWorkflowLogFilePath('/tmp/workspace/boq_format_log.txt', root)).toBe(false)
    expect(isEpcWorkflowLogFilePath('/tmp/workspace/other.txt', root)).toBe(false)
  })
})
