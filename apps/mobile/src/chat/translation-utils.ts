import type { TranslationLanguage } from '@toolman/shared'

export const DEFAULT_TRANSLATION_LANGUAGES: [TranslationLanguage, TranslationLanguage] = [
  'zh',
  'en',
]

export function normalizeTranslationLanguages(
  languages?: readonly string[],
): [TranslationLanguage, TranslationLanguage] {
  const first = languages?.[0] === 'en' ? 'en' : languages?.[0] === 'zh' ? 'zh' : null
  const second = languages?.[1] === 'en' ? 'en' : languages?.[1] === 'zh' ? 'zh' : null
  if (!first || !second || first === second) {
    return [...DEFAULT_TRANSLATION_LANGUAGES]
  }
  return [first, second]
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
  languages?: readonly string[],
): TranslationLanguage {
  const normalized = normalizeTranslationLanguages(languages)
  const source = detectSourceLanguage(text)
  if (source === normalized[0]) return normalized[1]
  return normalized[0]
}

export function translationLanguageLabel(language: TranslationLanguage): string {
  return language === 'zh' ? '中文' : 'English'
}
