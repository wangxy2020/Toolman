import { resolveCuratedEdgeTtsVoice, type VoiceTtsEngine } from '@toolman/shared'
import { EdgeTtsEngine } from './edgeTts'
import { sanitizeSpeakableText } from './sanitizeSpeakableText'
import type { MobileTtsConfig, TtsPlaybackState } from './types'
import { WebSpeechTtsEngine } from './webSpeechTts'

type Listener = (state: {
  playingMessageId: string | null
  playbackState: TtsPlaybackState
  activeEngine: string | null
  lastError: string | null
  fellBack: boolean
}) => void

/**
 * Desktop-aligned TTS controller: prefer Microsoft Edge neural voices, fall back to Web Speech.
 */
export class MobileTtsController {
  private config: MobileTtsConfig = {
    engine: 'edge',
    voice: resolveCuratedEdgeTtsVoice(null),
  }
  private edge = new EdgeTtsEngine({ voice: this.config.voice })
  private web = new WebSpeechTtsEngine()
  private abort: AbortController | null = null
  private active: 'edge' | 'web-speech' | null = null
  private playingMessageId: string | null = null
  private listeners = new Set<Listener>()
  private playbackState: TtsPlaybackState = 'idle'
  private lastError: string | null = null
  private fellBack = false

  configure(config: Partial<MobileTtsConfig> & { engine?: VoiceTtsEngine }): void {
    const engine = config.engine === 'web-speech' ? 'web-speech' : 'edge'
    const voice = resolveCuratedEdgeTtsVoice(config.voice ?? this.config.voice)
    this.config = { engine, voice }
    this.edge.setVoice(voice)
  }

  getConfig(): MobileTtsConfig {
    return { ...this.config }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(this.snapshot())
    return () => {
      this.listeners.delete(listener)
    }
  }

  private snapshot() {
    return {
      playingMessageId: this.playingMessageId,
      playbackState: this.playbackState,
      activeEngine: this.active,
      lastError: this.lastError,
      fellBack: this.fellBack,
    }
  }

  private emit(): void {
    const snapshot = this.snapshot()
    for (const listener of this.listeners) listener(snapshot)
  }

  /** Manual play / replay — same contract as desktop `speakMessage`. */
  speakMessage(messageId: string, text: string): void {
    const trimmed = sanitizeSpeakableText(text)
    if (!trimmed) return
    this.stop()
    const abort = new AbortController()
    this.abort = abort
    this.playingMessageId = messageId
    this.lastError = null
    this.fellBack = false
    this.playbackState = 'playing'
    this.active = this.config.engine === 'web-speech' ? 'web-speech' : 'edge'
    this.emit()
    void this.runSpeak(trimmed, abort)
  }

  private async runSpeak(text: string, abort: AbortController): Promise<void> {
    try {
      if (this.config.engine === 'web-speech') {
        this.active = 'web-speech'
        this.emit()
        await this.web.speak(text, abort.signal)
      } else {
        this.active = 'edge'
        this.emit()
        try {
          await this.edge.speak(text, abort.signal)
        } catch (error) {
          if (abort.signal.aborted) return
          const message = error instanceof Error ? error.message : 'Edge TTS 失败'
          this.lastError = message
          this.fellBack = true
          this.active = 'web-speech'
          this.emit()
          await this.web.speak(text, abort.signal)
        }
      }
    } catch (error) {
      if (!abort.signal.aborted) {
        this.lastError = error instanceof Error ? error.message : '语音播放失败'
        this.emit()
      }
    } finally {
      if (this.abort === abort) {
        this.abort = null
        this.active = null
        this.playingMessageId = null
        this.playbackState = 'idle'
        this.emit()
      }
    }
  }

  pause(): void {
    if (this.playbackState !== 'playing') return
    if (this.active === 'edge') this.edge.pause()
    else this.web.pause()
    this.playbackState = 'paused'
    this.emit()
  }

  resume(): void {
    if (this.playbackState !== 'paused') return
    if (this.active === 'edge') this.edge.resume()
    else this.web.resume()
    this.playbackState = 'playing'
    this.emit()
  }

  stop(): void {
    this.abort?.abort()
    this.abort = null
    this.edge.cancel()
    this.web.cancel()
    this.active = null
    this.playingMessageId = null
    this.playbackState = 'idle'
    this.emit()
  }
}

const GLOBAL_TTS_KEY = '__toolmanMobileTtsController_v1'

type GlobalTtsHost = {
  [GLOBAL_TTS_KEY]?: MobileTtsController
}

function isUsableController(value: unknown): value is MobileTtsController {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as MobileTtsController).speakMessage === 'function' &&
    typeof (value as MobileTtsController).configure === 'function' &&
    typeof (value as MobileTtsController).subscribe === 'function' &&
    typeof (value as MobileTtsController).stop === 'function'
  )
}

/**
 * Resolve the shared controller. Uses `globalThis` so Expo/Metro HMR cannot leave a
 * stale module-scoped singleton without `speakMessage` (common after Fast Refresh).
 */
export function getMobileTtsController(): MobileTtsController {
  const host = globalThis as typeof globalThis & GlobalTtsHost
  const existing = host[GLOBAL_TTS_KEY]
  if (isUsableController(existing)) return existing
  try {
    ;(existing as MobileTtsController | undefined)?.stop()
  } catch {
    // ignore stale instance teardown errors
  }
  const next = new MobileTtsController()
  host[GLOBAL_TTS_KEY] = next
  return next
}
