import { describe, expect, it } from 'vitest'

import { translate } from './translate'

describe('i18n translate', () => {
  it('returns zh-CN by default key', () => {
    expect(translate('zh-CN', 'nav.settings')).toBe('设置')
    expect(translate('en', 'nav.settings')).toBe('Settings')
  })

  it('interpolates params', () => {
    expect(
      translate('en', 'theme.switchTitle', { current: 'Light', next: 'Dark' }),
    ).toBe('Theme: Light, click to switch to Dark')
  })

  it('falls back to zh-CN for missing en key', () => {
    expect(translate('en', 'nonexistent.key')).toBe('nonexistent.key')
  })
})
