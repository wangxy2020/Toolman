import { useState } from 'react'
import { resolveTranslationTarget, translationLanguageLabel } from '../chat/translation-utils'
import { translateWithChatModel } from '../chat/translateWithModel'
import type { ModulePrefs } from '../settings/prefs'
import type { ChatMessage, ModelConfig } from '../state/MobileAppContext'
import type { MessageTranslation } from './agentPaneUtils'

export function useAgentRightPaneTranslate(input: {
  modelConfig: ModelConfig
  translationLanguages: ModulePrefs['agent']['translationLanguages']
  setError: (message: string | null) => void
}) {
  const { modelConfig, translationLanguages, setError } = input
  const [translations, setTranslations] = useState<Record<string, MessageTranslation>>({})
  const [visibleTranslationIds, setVisibleTranslationIds] = useState<Record<string, boolean>>({})
  const [translatingIds, setTranslatingIds] = useState<Record<string, boolean>>({})

  const translateMessage = async (msg: ChatMessage) => {
    if (msg.role !== 'assistant' || !msg.content.trim()) return
    const existing = translations[msg.id]
    if (existing && visibleTranslationIds[msg.id]) {
      setVisibleTranslationIds((prev) => ({ ...prev, [msg.id]: false }))
      return
    }
    if (existing) {
      setVisibleTranslationIds((prev) => ({ ...prev, [msg.id]: true }))
      return
    }

    const targetLanguage = resolveTranslationTarget(msg.content, translationLanguages)
    setTranslatingIds((prev) => ({ ...prev, [msg.id]: true }))
    setError(null)
    const result = await translateWithChatModel({
      config: modelConfig,
      text: msg.content,
      targetLang: translationLanguageLabel(targetLanguage),
    })
    setTranslatingIds((prev) => ({ ...prev, [msg.id]: false }))
    if (!result.ok) {
      setError(result.message)
      return
    }
    setTranslations((prev) => ({
      ...prev,
      [msg.id]: { text: result.text, targetLanguage },
    }))
    setVisibleTranslationIds((prev) => ({ ...prev, [msg.id]: true }))
  }

  const clearTranslationsFrom = (sessionMessages: ChatMessage[], fromIdx: number) => {
    setTranslations((prev) => {
      const copy = { ...prev }
      for (const msg of sessionMessages.slice(fromIdx)) delete copy[msg.id]
      return copy
    })
  }

  return {
    translations,
    visibleTranslationIds,
    translatingIds,
    translateMessage,
    clearTranslationsFrom,
  }
}
