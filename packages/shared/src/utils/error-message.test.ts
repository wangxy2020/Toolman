import { describe, expect, it } from 'vitest'

import { toErrorMessage } from './error-message.js'

describe('toErrorMessage', () => {
  it('returns Error message', () => {
    expect(toErrorMessage(new Error('boom'), 'fallback')).toBe('boom')
  })

  it('returns fallback for non-Error', () => {
    expect(toErrorMessage('oops', 'fallback')).toBe('fallback')
  })
})
