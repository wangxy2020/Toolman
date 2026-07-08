import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TRANSLATION_SETTINGS,
  normalizeTranslationSettings,
} from './translation-settings-storage'

describe('normalizeTranslationSettings', () => {
  it('applies defaults for empty input', () => {
    expect(normalizeTranslationSettings(null)).toEqual(DEFAULT_TRANSLATION_SETTINGS)
  })

  it('keeps a dedicated model id and language pair', () => {
    expect(
      normalizeTranslationSettings({
        modelId: 'ollama:gemma4:latest',
        languages: ['en', 'zh'],
        autoDetectSource: false,
        autoSaveAfterTranslate: true,
      }),
    ).toEqual({
      modelId: 'ollama:gemma4:latest',
      languages: ['en', 'zh'],
      autoDetectSource: false,
      autoSaveAfterTranslate: true,
      pdfParserBackend: 'opendataloader',
    })
  })

  it('treats blank model id as unset', () => {
    expect(normalizeTranslationSettings({ modelId: '   ' }).modelId).toBeNull()
  })

  it('rejects identical language pairs', () => {
    expect(normalizeTranslationSettings({ languages: ['zh', 'zh'] }).languages).toEqual([
      'zh',
      'en',
    ])
  })
})
