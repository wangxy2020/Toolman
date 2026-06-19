import { useCallback, useState } from 'react'
import { IpcChannel, type TranslationLanguage } from '@toolman/shared'
import {
  detectSourceLanguage,
  normalizeTranslationLanguages,
  resolveTranslationTarget,
} from './translation-utils'

interface TranslateOptions {
  text: string
  modelId: string
  translationLanguages?: [TranslationLanguage, TranslationLanguage]
}

export function useTranslate() {
  const [translating, setTranslating] = useState(false)

  const translate = useCallback(async (options: TranslateOptions) => {
    const text = options.text.trim()
    if (!text) {
      throw new Error('没有可翻译的内容')
    }

    const languages = normalizeTranslationLanguages(options.translationLanguages)
    const sourceLanguage = detectSourceLanguage(text)
    const targetLanguage = resolveTranslationTarget(text, languages)

    setTranslating(true)
    try {
      const result = await window.api.invoke(IpcChannel.MessageTranslate, {
        text,
        modelId: options.modelId,
        sourceLanguage,
        targetLanguage,
      })

      if (!result.ok) {
        throw new Error(result.error.message)
      }

      return result.data as {
        text: string
        sourceLanguage: TranslationLanguage
        targetLanguage: TranslationLanguage
      }
    } finally {
      setTranslating(false)
    }
  }, [])

  return { translate, translating }
}
