import { describe, expect, it } from 'vitest'
import { SETTINGS_TABS } from './tabs'

describe('SETTINGS_TABS', () => {
  it('covers user info and all product modules', () => {
    expect(SETTINGS_TABS.map((t) => t.id)).toEqual([
      'user',
      'agent',
      'knowledge',
      'notes',
      'translate',
      'group',
      'community',
      'classroom',
      'projects',
      'system',
    ])
  })
})
