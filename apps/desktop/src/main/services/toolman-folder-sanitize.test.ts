import { describe, expect, it } from 'vitest'

import { sanitizeUserFolderName } from './toolman-folder-sanitize'

describe('sanitizeUserFolderName', () => {
  it('returns default for empty or whitespace-only names', () => {
    expect(sanitizeUserFolderName('')).toBe('本地用户')
    expect(sanitizeUserFolderName('   ')).toBe('本地用户')
  })

  it('replaces invalid path characters and collapses spaces', () => {
    expect(sanitizeUserFolderName('  Alice/Bob  ')).toBe('Alice-Bob')
    expect(sanitizeUserFolderName('bad:name*?')).toBe('bad-name--')
  })

  it('keeps sanitized punctuation-only names', () => {
    expect(sanitizeUserFolderName('???')).toBe('---')
  })
})
