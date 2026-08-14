import { describe, expect, it } from 'vitest'
import { translate } from './messages'

describe('translate', () => {
  it('returns Chinese and English settings labels', () => {
    expect(translate('zh-CN', 'settings.modelService')).toBe('模型服务')
    expect(translate('en', 'settings.modelService')).toBe('Model service')
    expect(translate('zh-CN', 'settings.display')).toBe('显示')
    expect(translate('en', 'settings.memory')).toBe('Memory')
  })

  it('interpolates variables', () => {
    expect(translate('zh-CN', 'diagnostics.hostOnline', { count: 2 })).toBe('2 在线')
    expect(translate('en', 'quickPhrases.deleteConfirm', { label: 'Hi' })).toBe(
      'Delete phrase “Hi”?',
    )
  })

  it('falls back to zh-CN when a key is missing in English', () => {
    expect(translate('en', 'language.zhCN')).toBe('简体中文')
  })
})
