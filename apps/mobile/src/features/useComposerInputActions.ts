import { useRef, useState } from 'react'
import {
  startComposerVoiceInput,
  appendVoiceTranscript,
  speechRecognitionLocale,
  VOICE_HOLD_HINT,
  type VoiceInputSession,
} from '../chat/composerVoiceInput'
import { resolveAgentChatScope } from '../chat/agentScopes'
import { resolveTranslationTarget, shouldRestoreComposerTranslation, translationLanguageLabel } from '../chat/translation-utils'
import { translateWithChatModel } from '../chat/translateWithModel'
import { useI18n } from '../i18n'
import { useMobileApp } from '../state/MobileAppContext'
import { resolveActiveAgent, resolveAgentSettings } from './agentSettingsResolve'

export function useComposerInputActions(options: {
  value: string
  onChangeText: (text: string) => void
  disabled: boolean
  busy: boolean
  blurInput?: () => void
  onError?: (message: string | null) => void
}) {
  const { value, onChangeText, disabled, busy, blurInput, onError } = options
  const { modelConfig, modulePrefs, module, agents, sessions, activeSessionId } = useMobileApp()
  const { language } = useI18n()
  const [translating, setTranslating] = useState(false)
  const [listening, setListening] = useState(false)
  const voiceSessionRef = useRef<VoiceInputSession | null>(null)
  const voiceBaseRef = useRef(value)
  const translateSnapshotRef = useRef<{ original: string; translated: string } | null>(null)
  const agentScope = resolveAgentChatScope(module)
  const agentSettings = resolveAgentSettings(
    resolveActiveAgent({ agents, sessions, activeSessionId, agentScope }),
    modulePrefs.agent,
  )

  const translateInput = async () => {
    const text = value.trim()
    if (!text || disabled || busy || translating) return
    const snapshot = translateSnapshotRef.current
    if (shouldRestoreComposerTranslation(value, snapshot)) {
      onChangeText(snapshot.original)
      translateSnapshotRef.current = null
      onError?.(null)
      return
    }
    if (!modelConfig.model.trim() || !modelConfig.baseUrl.trim()) {
      onError?.('请先在设置中配置模型服务')
      return
    }
    onError?.(null)
    const original = value
    const target = resolveTranslationTarget(text, agentSettings.translationLanguages)
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
    translateSnapshotRef.current = { original, translated: result.text }
    onChangeText(result.text)
  }

  const startVoiceInput = () => {
    if (disabled || busy || translating || listening) return
    blurInput?.()
    voiceBaseRef.current = value
    const started = startComposerVoiceInput({
      lang: speechRecognitionLocale(language),
      onTranscript: (text) => onChangeText(appendVoiceTranscript(voiceBaseRef.current, text)),
      onError: (message) => {
        setListening(false)
        voiceSessionRef.current = null
        onError?.(message)
      },
      onEnd: () => {
        setListening(false)
        voiceSessionRef.current = null
      },
    })
    if (!started.ok) {
      onError?.(started.message)
      return
    }
    onError?.(null)
    setListening(true)
    voiceSessionRef.current = started.session
  }

  const stopVoiceInput = () => {
    voiceSessionRef.current?.stop()
    voiceSessionRef.current = null
  }

  const hintVoiceInput = () => {
    if (listening) return
    onError?.(VOICE_HOLD_HINT)
  }

  return {
    translating,
    listening,
    canTranslate: Boolean(value.trim()) && !disabled && !busy && !translating,
    canVoice: !disabled && !busy && !translating,
    translateInput,
    startVoiceInput,
    stopVoiceInput,
    hintVoiceInput,
  }
}
