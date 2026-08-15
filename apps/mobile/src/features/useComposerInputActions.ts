import { useState } from 'react'
import { resolveTranslationTarget, translationLanguageLabel } from '../chat/translation-utils'
import { translateWithChatModel } from '../chat/translateWithModel'
import { useMobileApp } from '../state/MobileAppContext'

export function useComposerInputActions(options: {
  value: string
  onChangeText: (text: string) => void
  disabled: boolean
  busy: boolean
  onError?: (message: string | null) => void
}) {
  const { value, onChangeText, disabled, busy, onError } = options
  const { modelConfig, modulePrefs } = useMobileApp()
  const [translating, setTranslating] = useState(false)

  const translateInput = async () => {
    const text = value.trim()
    if (!text || disabled || busy || translating) return
    if (!modelConfig.model.trim() || !modelConfig.baseUrl.trim()) {
      onError?.('请先在设置中配置模型服务')
      return
    }
    onError?.(null)
    const target = resolveTranslationTarget(text, modulePrefs.agent.translationLanguages)
    setTranslating(true)
    const result = await translateWithChatModel({
      config: modelConfig,
      text,
      targetLang: translationLanguageLabel(target),
    })
    setTranslating(false)
    if (!result.ok) {
      onError?.(result.message)
      return
    }
    onChangeText(result.text)
  }

  return {
    translating,
    canTranslate: Boolean(value.trim()) && !disabled && !busy && !translating,
    translateInput,
  }
}
