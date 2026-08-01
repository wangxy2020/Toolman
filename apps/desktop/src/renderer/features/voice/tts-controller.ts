import { sanitizeSpeakableText } from './sanitize-speakable-text'
import { FallbackTtsProvider } from './fallback-tts-provider'
import { TtsPlaybackQueue } from './tts-playback-queue'
import {
  createTtsProvider,
  DEFAULT_TTS_PROVIDER_CONFIG,
  type TtsProviderConfig,
} from './tts-provider-factory'
import { TtsSentenceSplitter } from './tts-sentence-splitter'
import type { TtsControllerListener, TtsPlaybackState, TtsProvider } from './tts-types'

/**
 * Orchestrates stream → sentence split → async playback queue.
 * Independent of agent generation; feed only final-answer text.
 */
export class TtsController {
  private provider: TtsProvider
  private queue: TtsPlaybackQueue
  private config: TtsProviderConfig = { ...DEFAULT_TTS_PROVIDER_CONFIG }
  private readonly splitter = new TtsSentenceSplitter()
  private readonly listeners = new Set<TtsControllerListener>()
  private playingMessageId: string | null = null
  private streamMessageId: string | null = null
  private fedLength = 0
  private playbackState: TtsPlaybackState = 'idle'
  private activeEngine: string | null = null
  private lastError: string | null = null

  constructor(provider?: TtsProvider) {
    this.provider = provider ?? createTtsProvider(DEFAULT_TTS_PROVIDER_CONFIG)
    this.queue = this.createQueue(this.provider)
  }

  /** Switch engine / voice (stops current playback). */
  configure(config: Partial<TtsProviderConfig>): void {
    const next: TtsProviderConfig = {
      engine: config.engine ?? this.config.engine,
      voice: config.voice ?? this.config.voice,
    }
    if (next.engine === this.config.engine && next.voice === this.config.voice) return
    this.stop()
    this.config = next
    this.provider = createTtsProvider(next)
    this.queue = this.createQueue(this.provider)
  }

  getConfig(): TtsProviderConfig {
    return { ...this.config }
  }

  subscribe(listener: TtsControllerListener): () => void {
    this.listeners.add(listener)
    listener(this.snapshot())
    return () => this.listeners.delete(listener)
  }

  getPlayingMessageId(): string | null {
    return this.playingMessageId
  }

  getPlaybackState(): TtsPlaybackState {
    return this.playbackState
  }

  /** Manual play / replay: stop current, speak full text from the start. */
  speakMessage(messageId: string, text: string): void {
    const clean = sanitizeSpeakableText(text)
    if (!clean) return
    this.stop()
    // Rebuild provider so the latest voice/engine from configure() is always used.
    this.provider = createTtsProvider(this.config)
    this.queue = this.createQueue(this.provider)
    this.playingMessageId = messageId
    this.streamMessageId = null
    this.fedLength = 0
    this.splitter.reset()
    this.lastError = null
    this.activeEngine = this.config.engine
    this.playbackState = 'playing'
    this.emit()
    const oneShot = new TtsSentenceSplitter()
    const parts = [...oneShot.append(clean), ...oneShot.flush()]
    this.queue.enqueueAll(parts.length > 0 ? parts : [clean])
  }

  /** Feed cumulative final-answer text for auto-speak streaming. */
  feedStreamText(messageId: string, cumulativeText: string): void {
    if (this.streamMessageId !== messageId) {
      if (this.playingMessageId && this.playingMessageId !== messageId && this.queue.busy) {
        this.stop()
      }
      this.provider = createTtsProvider(this.config)
      this.queue = this.createQueue(this.provider)
      this.streamMessageId = messageId
      this.playingMessageId = messageId
      this.fedLength = 0
      this.splitter.reset()
      this.lastError = null
      this.activeEngine = this.config.engine
      this.emit()
    }

    const clean = sanitizeSpeakableText(cumulativeText)
    if (clean.length <= this.fedLength) return
    const delta = clean.slice(this.fedLength)
    this.fedLength = clean.length
    const sentences = this.splitter.append(delta)
    if (sentences.length > 0) {
      this.playingMessageId = messageId
      this.emit()
      this.queue.enqueueAll(sentences)
    }
  }

  endStream(messageId: string): void {
    if (this.streamMessageId !== messageId) return
    const rest = this.splitter.flush()
    if (rest.length > 0) {
      this.playingMessageId = messageId
      this.emit()
      this.queue.enqueueAll(rest)
    }
    this.streamMessageId = null
    this.fedLength = 0
  }

  pause(): void {
    if (this.playbackState !== 'playing') return
    this.queue.pause()
  }

  resume(): void {
    if (this.playbackState !== 'paused') return
    this.queue.resume()
  }

  stop(): void {
    this.splitter.reset()
    this.streamMessageId = null
    this.fedLength = 0
    this.playingMessageId = null
    this.playbackState = 'idle'
    // Clearing intentional stop errors so the chat error bar does not show
    // "Audio playback failed" from media element teardown.
    this.lastError = null
    this.queue.stop()
    this.emit()
  }

  private createQueue(provider: TtsProvider): TtsPlaybackQueue {
    const queue = new TtsPlaybackQueue(provider)
    queue.setOnStateChange((state) => {
      this.playbackState = state
      const fallback =
        typeof (provider as FallbackTtsProvider).getLastResult === 'function'
          ? (provider as FallbackTtsProvider)
          : null
      const result = fallback?.getLastResult()
      if (result) {
        this.activeEngine = result.engine
        if (result.fellBack) {
          this.lastError =
            result.error ??
            'Edge 语音合成失败，已回退到系统语音（音色设置不会生效，请检查网络）'
        } else if (state === 'playing') {
          this.lastError = null
        }
      } else {
        this.activeEngine = provider.id
      }
      if (state === 'idle') {
        this.playingMessageId = null
      }
      this.emit()
    })
    queue.setOnIdle(() => {
      if (!queue.busy) {
        this.playingMessageId = null
        this.playbackState = 'idle'
        this.emit()
      }
    })
    return queue
  }

  private snapshot() {
    return {
      playingMessageId: this.playingMessageId,
      playbackState: this.playbackState,
      activeEngine: this.activeEngine,
      lastError: this.lastError,
    }
  }

  private emit(): void {
    const state = this.snapshot()
    for (const listener of this.listeners) listener(state)
  }
}

let sharedController: TtsController | null = null

export function getSharedTtsController(): TtsController {
  if (!sharedController) sharedController = new TtsController()
  return sharedController
}

export function configureSharedTts(config: Partial<TtsProviderConfig>): void {
  getSharedTtsController().configure(config)
}
