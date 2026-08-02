import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { stripSocraticMachineBlocks, type Message, type VoiceTtsEngine } from '@toolman/shared'
import { getUserFacingMessageText } from '../chat/message-utils'
import { unlockAudioPlayback } from './audio-unlock'
import { configureSharedTts, getSharedTtsController } from './tts-controller'
import { resolveCuratedEdgeTtsVoice } from './tts-provider-factory'
import type { TtsPlaybackState } from './tts-types'

/**
 * Hooks the shared TTS controller into chat UI:
 * - configures Edge / Web Speech from assistant settings
 * - manual speak / pause / resume / stop
 * - optional auto-speak of streaming final-answer text
 */
export function useAssistantTts(options: {
  autoSpeak: boolean
  ttsEngine?: VoiceTtsEngine | null
  ttsVoice?: string | null
  sessionId: string | null
  messages: Message[]
  onError?: (message: string | null) => void
}) {
  const controller = useMemo(() => getSharedTtsController(), [])
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null)
  const [playbackState, setPlaybackState] = useState<TtsPlaybackState>('idle')
  const streamingIdRef = useRef<string | null>(null)
  const reportedErrorRef = useRef<string | null>(null)
  const onErrorRef = useRef(options.onError)
  onErrorRef.current = options.onError
  const engine = options.ttsEngine === 'web-speech' ? 'web-speech' : 'edge'
  const voice = resolveCuratedEdgeTtsVoice(options.ttsVoice)

  useEffect(() => {
    return controller.subscribe((state) => {
      setPlayingMessageId(state.playingMessageId)
      setPlaybackState(state.playbackState)
      if (state.lastError === reportedErrorRef.current) return
      reportedErrorRef.current = state.lastError
      if (state.lastError) {
        onErrorRef.current?.(state.lastError)
      }
    })
  }, [controller])

  useEffect(() => {
    configureSharedTts({ engine, voice })
  }, [engine, voice])

  useEffect(() => {
    streamingIdRef.current = null
    controller.stop()
    reportedErrorRef.current = null
    onErrorRef.current?.(null)
  }, [controller, options.sessionId])

  useEffect(() => {
    if (!options.autoSpeak) {
      streamingIdRef.current = null
      return
    }

    const streaming = [...options.messages]
      .reverse()
      .find((message) => message.role === 'assistant' && message.status === 'streaming')

    if (streaming) {
      streamingIdRef.current = streaming.id
      configureSharedTts({ engine, voice })
      controller.feedStreamText(streaming.id, getUserFacingMessageText(streaming))
      return
    }

    const previousStreamingId = streamingIdRef.current
    if (!previousStreamingId) return
    streamingIdRef.current = null

    const finished = options.messages.find((message) => message.id === previousStreamingId)
    if (!finished) {
      controller.stop()
      return
    }
    if (finished.status === 'completed') {
      controller.endStream(finished.id)
      return
    }
    controller.stop()
  }, [controller, engine, options.autoSpeak, options.messages, voice])

  const speakMessage = useCallback(
    (messageId: string, text: string) => {
      // Must run in the click stack so Edge blob playback is allowed after IPC.
      unlockAudioPlayback()
      configureSharedTts({ engine, voice })
      controller.speakMessage(messageId, stripSocraticMachineBlocks(text))
    },
    [controller, engine, voice],
  )

  const pause = useCallback(() => {
    controller.pause()
  }, [controller])

  const resume = useCallback(() => {
    controller.resume()
  }, [controller])

  const stop = useCallback(() => {
    controller.stop()
  }, [controller])

  return { playingMessageId, playbackState, speakMessage, pause, resume, stop }
}
