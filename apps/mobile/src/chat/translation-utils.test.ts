import { describe, expect, it } from 'vitest'

import {
  detectSourceLanguage,
  normalizeTranslationLanguages,
  resolveTranslationTarget,
} from './translation-utils'

describe('translation-utils', () => {
  it('normalizes missing or identical pairs to zh/en', () => {
    expect(normalizeTranslationLanguages()).toEqual(['zh', 'en'])
    expect(normalizeTranslationLanguages(['zh', 'zh'])).toEqual(['zh', 'en'])
  })

  it('detects CJK as Chinese', () => {
    expect(detectSourceLanguage('请把这段话翻译一下')).toBe('zh')
    expect(detectSourceLanguage('Hello world')).toBe('en')
  })

  it('picks the other language in the pair', () => {
    expect(resolveTranslationTarget('你好', ['zh', 'en'])).toBe('en')
    expect(resolveTranslationTarget('hello', ['zh', 'en'])).toBe('zh')
  })
})
