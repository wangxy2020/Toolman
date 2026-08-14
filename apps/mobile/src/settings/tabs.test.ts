import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SYSTEM_SECTION,
  isSystemSection,
  SETTINGS_TABS,
  SYSTEM_SETTINGS_SECTIONS,
} from './tabs'

describe('SETTINGS_TABS', () => {
  it('keeps user and model service at the top level', () => {
    expect(SETTINGS_TABS.map((t) => t.id)).toEqual(['user', 'agent'])
    expect(SETTINGS_TABS.find((t) => t.id === 'agent')?.labelKey).toBe('settings.modelService')
  })

  it('nests mobile-relevant desktop settings under 系统设置', () => {
    expect(SYSTEM_SETTINGS_SECTIONS.map((t) => t.id)).toEqual([
      'general',
      'display',
      'memory',
      'quick-phrases',
      'diagnostics',
      'about',
    ])
    expect(DEFAULT_SYSTEM_SECTION).toBe('general')
    expect(isSystemSection('display')).toBe(true)
    expect(isSystemSection('quick-phrases')).toBe(true)
    expect(isSystemSection('user')).toBe(false)
  })
})
