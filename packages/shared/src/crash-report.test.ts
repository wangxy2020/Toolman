import { describe, expect, it } from 'vitest'

import { redactCrashReportText } from './crash-report.js'

describe('redactCrashReportText', () => {
  it('redacts api keys and bearer tokens', () => {
    const input = 'failed with sk-abcdefghijklmnopqrstuvwxyz and Bearer eyJhbGciOiJIUzI1NiJ9'
    const output = redactCrashReportText(input)
    expect(output).not.toContain('sk-abcdefghijklmnopqrstuvwxyz')
    expect(output).not.toContain('Bearer eyJ')
    expect(output).toContain('[REDACTED]')
  })

  it('replaces home path prefix', () => {
    const output = redactCrashReportText('/Users/test/project/file.ts', '/Users/test')
    expect(output).toBe('~/project/file.ts')
  })
})
