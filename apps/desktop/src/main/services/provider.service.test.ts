import { describe, expect, it } from 'vitest'

import { isChatModelId } from './provider.service'

describe('provider.service helpers', () => {
  it('filters embedding models from chat model ids', () => {
    expect(isChatModelId('gpt-4o-mini')).toBe(true)
    expect(isChatModelId('bge-large')).toBe(false)
    expect(isChatModelId('nomic-embed-text')).toBe(false)
  })
})
