import { describe, expect, it } from 'vitest'
import { parseSessionListCursor } from '@toolman/db'

describe('parseSessionListCursor', () => {
  it('parses sortTime and session id', () => {
    expect(parseSessionListCursor('1700000000000:00000000-0000-4000-8000-000000000099')).toEqual({
      sortTime: 1_700_000_000_000,
      id: '00000000-0000-4000-8000-000000000099',
    })
  })

  it('returns null for malformed cursors', () => {
    expect(parseSessionListCursor('')).toBeNull()
    expect(parseSessionListCursor('abc')).toBeNull()
    expect(parseSessionListCursor('NaN:id')).toBeNull()
  })
})
