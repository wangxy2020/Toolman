import type { TranslationLanguage } from '@toolman/shared'

export const DEFAULT_TRANSLATION_LANGUAGES: [TranslationLanguage, TranslationLanguage] = [
  'zh',
  'en',
]

export const TRANSLATION_LANGUAGE_OPTIONS: { value: TranslationLanguage; label: string }[] = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
]

export function normalizeTranslationLanguages(
  languages?: [TranslationLanguage, TranslationLanguage],
): [TranslationLanguage, TranslationLanguage] {
  if (!languages || languages[0] === languages[1]) {
    return [...DEFAULT_TRANSLATION_LANGUAGES]
  }
  return languages
}

export function detectSourceLanguage(text: string): TranslationLanguage {
  const trimmed = text.trim()
  if (!trimmed) return 'en'

  const cjkCount = (trimmed.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) ?? []).length
  const latinCount = (trimmed.match(/[a-zA-Z]/g) ?? []).length

  if (cjkCount >= latinCount) return 'zh'
  return 'en'
}

export function resolveTranslationTarget(
  text: string,
  languages: [TranslationLanguage, TranslationLanguage],
): TranslationLanguage {
  const normalized = normalizeTranslationLanguages(languages)
  const source = detectSourceLanguage(text)
  if (source === normalized[0]) return normalized[1]
  return normalized[0]
}

export function translationLanguageLabel(language: TranslationLanguage): string {
  return language === 'zh' ? '中文' : 'English'
}
