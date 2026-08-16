import type { TranslationLanguage } from '@toolman/shared'
import type { TranslationDocumentPageSnapshot } from './translation-storage'

export interface SaveTranslationContrastInput {
  sourceText: string
  targetText: string
  languages: [TranslationLanguage, TranslationLanguage]
}

export interface SaveTranslationDocumentInput {
  sourceText: string
  targetText: string
  languages: [TranslationLanguage, TranslationLanguage]
  pageSnapshots?: TranslationDocumentPageSnapshot[]
}
