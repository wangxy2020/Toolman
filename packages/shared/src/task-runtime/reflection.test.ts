import { describe, expect, it } from 'vitest'

import { normalizeReflectionVerdict, parseTaskReflectionFromText } from './reflection.js'

describe('reflection', () => {
  it('parses reflection JSON', () => {
    const result = parseTaskReflectionFromText(
      JSON.stringify({
        verdict: 'pass',
        reason: '目标已达成',
        summary: '文件已写入',
      }),
    )
    expect(result.verdict).toBe('pass')
  })

  it('normalizes continue and abort', () => {
    expect(normalizeReflectionVerdict('continue')).toBe('pass')
    expect(normalizeReflectionVerdict('abort')).toBe('fail')
    expect(normalizeReflectionVerdict('replan')).toBe('replan')
  })
})
