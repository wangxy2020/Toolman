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

  it('uses English price-list column names Categories / Subproject / No', () => {
    expect(translate('en', 'projectManagerPage.costTable.columns.type')).toBe('Categories')
    expect(translate('en', 'projectManagerPage.costTable.columns.sectionalWork')).toBe(
      'Subdivision Work',
    )
    expect(translate('en', 'projectManagerPage.costTable.columns.subproject')).toBe('Subproject')
    expect(translate('en', 'projectManagerPage.costTable.columns.code')).toBe('No')
    expect(translate('en', 'projectManagerPage.costTable.columns.name')).toBe('Work Name')
    expect(translate('en', 'projectManagerPage.costTable.columns.featureDescription')).toBe(
      'Description',
    )
    expect(translate('en', 'projectManagerPage.costTable.columns.totalPrice', { currency: 'CNY' })).toBe(
      'Total Price (CNY)',
    )
    expect(translate('zh-CN', 'projectManagerPage.costTable.columns.type')).toBe('类型')
    expect(translate('zh-CN', 'projectManagerPage.costTable.columns.sectionalWork')).toBe(
      '分部工程',
    )
    expect(translate('zh-CN', 'projectManagerPage.costTable.columns.subproject')).toBe('子项目')
    expect(translate('zh-CN', 'projectManagerPage.costTable.columns.code')).toBe('编码')
  })
})
