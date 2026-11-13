import { useCallback, useRef, useState } from 'react'
import { IpcChannel, type TranslationLanguage } from '@toolman/shared'
import {
  detectSourceLanguage,
  normalizeTranslationLanguages,
  resolveTranslationTarget,
} from './translation-utils'

/** Renderer-side ceiling so a hung IPC cannot spin the header forever. */
const TRANSLATE_INVOKE_TIMEOUT_MS = 120_000

interface TranslateOptions {
  text: string
  modelId: string
  translationLanguages?: [TranslationLanguage, TranslationLanguage]
  /** When false, use configured language pair as-is. Default true. */
  autoDetectSource?: boolean
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms)
    promise.then(
      (value) => {
        window.clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        window.clearTimeout(timer)
        reject(error)
      },
    )
  })
}

export function useTranslate() {
  const [translating, setTranslating] = useState(false)
  const inflightRef = useRef(0)

  const translate = useCallback(async (options: TranslateOptions) => {
    const text = options.text.trim()
    if (!text) {
      throw new Error('没有可翻译的内容')
    }

    const languages = normalizeTranslationLanguages(options.translationLanguages)
    const autoDetectSource = options.autoDetectSource !== false
    const sourceLanguage = autoDetectSource ? detectSourceLanguage(text) : languages[0]
    const targetLanguage = autoDetectSource
      ? resolveTranslationTarget(text, languages)
      : languages[1]

    inflightRef.current += 1
    setTranslating(true)
    try {
      const result = await withTimeout(
        window.api.invoke(IpcChannel.MessageTranslate, {
          text,
          modelId: options.modelId,
          sourceLanguage,
          targetLanguage,
        }),
        TRANSLATE_INVOKE_TIMEOUT_MS,
        '翻译超时，请检查模型服务后重试',
      )

      if (!result.ok) {
        throw new Error(result.error.message)
      }

      return result.data as {
        text: string
        sourceLanguage: TranslationLanguage
        targetLanguage: TranslationLanguage
      }
    } finally {
      inflightRef.current = Math.max(0, inflightRef.current - 1)
      setTranslating(inflightRef.current > 0)
    }
  }, [])

  return { translate, translating }
}
