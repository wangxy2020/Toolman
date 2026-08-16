import { useEffect, useRef, useState } from 'react'
import type { ModulePrefs } from '../settings/prefs'
import type { ChatMessage } from '../state/MobileAppContext'
import { getMobileTtsController, unlockAudioPlayback, type TtsPlaybackState } from '../voice'

export function useAgentRightPaneTts(agentSettings: {
  ttsEngine: ModulePrefs['agent']['ttsEngine']
  ttsVoice: string
  autoSpeak: boolean
}) {
  const [speakingId, setSpeakingId] = useState<string | null>(null)
  const [ttsState, setTtsState] = useState<TtsPlaybackState>('idle')
  const [actionHint, setActionHint] = useState<string | null>(null)
  const ttsHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    getMobileTtsController().configure({
      engine: agentSettings.ttsEngine,
      voice: agentSettings.ttsVoice,
    })
  }, [agentSettings.ttsEngine, agentSettings.ttsVoice])

  useEffect(() => {
    return getMobileTtsController().subscribe((state) => {
      setTtsState(state.playbackState)
      setSpeakingId(state.playingMessageId)
      // Only surface fallback while a utterance is actually playing — leftover
      // fellBack/lastError after stop/configure is not a settings error.
      if (
        state.fellBack &&
        state.lastError &&
        (state.playbackState === 'playing' || state.playbackState === 'paused')
      ) {
        setActionHint('当前无法使用 Edge 语音，已改用系统语音朗读')
        if (ttsHintTimerRef.current) clearTimeout(ttsHintTimerRef.current)
        ttsHintTimerRef.current = setTimeout(() => setActionHint(null), 3000)
      }
    })
  }, [])

  useEffect(() => {
    return () => {
      if (ttsHintTimerRef.current) clearTimeout(ttsHintTimerRef.current)
      getMobileTtsController().stop()
    }
  }, [])

  const autoSpeakReply = (messageId: string, content: string) => {
    if (!agentSettings.autoSpeak) return
    if (!content.trim()) return
    const tts = getMobileTtsController()
    tts.configure({
      engine: agentSettings.ttsEngine,
      voice: agentSettings.ttsVoice,
    })
    tts.speakMessage(messageId, content)
  }

  const speakMessage = (msg: ChatMessage) => {
    unlockAudioPlayback()
    const tts = getMobileTtsController()
    tts.configure({
      engine: agentSettings.ttsEngine,
      voice: agentSettings.ttsVoice,
    })
    tts.speakMessage(msg.id, msg.content)
  }

  const stopTts = () => getMobileTtsController().stop()

  return {
    speakingId,
    setSpeakingId,
    ttsState,
    actionHint,
    setActionHint,
    autoSpeakReply,
    speakMessage,
    stopTts,
  }
}
