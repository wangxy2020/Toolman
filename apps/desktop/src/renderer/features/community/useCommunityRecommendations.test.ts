import { describe, expect, it } from 'vitest'

import { RECOMMEND_RESOURCE_LIMIT } from './useCommunityRecommendations'

describe('useCommunityRecommendations', () => {
  it('limits each recommendation section size', () => {
    expect(RECOMMEND_RESOURCE_LIMIT).toBe(5)
  })
})
