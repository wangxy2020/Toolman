import { describe, expect, it } from 'vitest'

import { preferAnswerContent } from './openai-shared.js'

describe('preferAnswerContent', () => {
  it('keeps visible content when present', () => {
    expect(preferAnswerContent('  你好  ', 'hidden reasoning')).toBe('  你好  ')
  })

  it('falls back to reasoning when content is empty', () => {
    expect(preferAnswerContent('', '你的穿着太惊艳了。无可挑剔。')).toBe(
      '你的穿着太惊艳了。无可挑剔。',
    )
    expect(preferAnswerContent('   ', 'fallback')).toBe('fallback')
  })
})
