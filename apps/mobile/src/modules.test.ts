import { describe, expect, it } from 'vitest'
import { TOP_NAV_MODULE_IDS } from './module-ids'

describe('TOP_NAV_MODULE_IDS', () => {
  it('omits translate from the top bar', () => {
    expect([...TOP_NAV_MODULE_IDS]).toEqual([
      'agent',
      'knowledge',
      'notes',
      'group',
      'community',
      'classroom',
      'projects',
    ])
  })
})
