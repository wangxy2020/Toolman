import type { TtsProvider } from './tts-types'
import { WebSpeechTtsProvider } from './web-speech-tts-provider'

export type FallbackSpeakResult = {
  engine: string
  fellBack: boolean
  error?: string
}

const RATE_LIMIT_COOLDOWN_MS = 45_000

function isRateLimitedError(message: string): boolean {
  return /429|rate.?limit|too many|限流/i.test(message)
}

/**
 * Prefer Edge; on failure fall back to Web Speech (offline).
 * After HTTP 429, stick to Web Speech for a cooldown so mid-message voice
 * does not flip-flop between neural and system speech.
 */
export class FallbackTtsProvider implements TtsProvider {
  readonly id = 'fallback'
  private readonly fallback = new WebSpeechTtsProvider()
  private active: TtsProvider | null = null
  private lastResult: FallbackSpeakResult | null = null
  private preferFallbackUntil = 0

  constructor(private readonly primary: TtsProvider) {}

  getLastResult(): FallbackSpeakResult | null {
    return this.lastResult
  }

  clearLastResult(): void {
    this.lastResult = null
  }

  async speak(text: string, signal: AbortSignal): Promise<void> {
    if (signal.aborted) return
    this.lastResult = null

    const now = Date.now()
    if (now < this.preferFallbackUntil) {
      this.active = this.fallback
      try {
        await this.fallback.speak(text, signal)
        if (!signal.aborted) {
          this.lastResult = {
            engine: this.fallback.id,
            fellBack: true,
            error: 'Edge 语音限流，暂用系统语音（稍后自动恢复神经语音）',
          }
        }
      } finally {
        this.active = null
      }
      return
    }

    this.active = this.primary
    try {
      await this.primary.speak(text, signal)
      if (!signal.aborted) {
        this.lastResult = { engine: this.primary.id, fellBack: false }
      }
    } catch (error) {
      // User stop / abort must not fall back or surface as a failure.
      if (signal.aborted) return
      const message = error instanceof Error ? error.message : 'Edge TTS failed'
      if (isRateLimitedError(message)) {
        this.preferFallbackUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS
      }
      console.warn('[tts] Edge neural voice failed, falling back to Web Speech:', message)
      this.active = this.fallback
      await this.fallback.speak(text, signal)
      if (!signal.aborted) {
        this.lastResult = {
          engine: this.fallback.id,
          fellBack: true,
          error: `${message}（已回退系统语音）`,
        }
      }
    } finally {
      this.active = null
    }
  }

  pause(): void {
    this.active?.pause()
    this.primary.pause()
    this.fallback.pause()
  }

  resume(): void {
    this.active?.resume()
    this.primary.resume()
    this.fallback.resume()
  }

  cancel(): void {
    this.active?.cancel()
    this.primary.cancel()
    this.fallback.cancel()
    this.active = null
    this.lastResult = null
  }
}
