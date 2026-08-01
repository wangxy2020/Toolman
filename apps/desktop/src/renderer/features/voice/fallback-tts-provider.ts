import type { TtsProvider } from './tts-types'
import { WebSpeechTtsProvider } from './web-speech-tts-provider'

export type FallbackSpeakResult = {
  engine: string
  fellBack: boolean
  error?: string
}

/**
 * Prefer Edge; on failure fall back to Web Speech (offline).
 * Exposes which engine actually spoke so UI can warn when voice selection was ignored.
 */
export class FallbackTtsProvider implements TtsProvider {
  readonly id = 'fallback'
  private readonly fallback = new WebSpeechTtsProvider()
  private active: TtsProvider | null = null
  private lastResult: FallbackSpeakResult | null = null

  constructor(private readonly primary: TtsProvider) {}

  getLastResult(): FallbackSpeakResult | null {
    return this.lastResult
  }

  async speak(text: string, signal: AbortSignal): Promise<void> {
    if (signal.aborted) return
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
      this.active = this.fallback
      await this.fallback.speak(text, signal)
      if (!signal.aborted) {
        this.lastResult = { engine: this.fallback.id, fellBack: true, error: message }
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
  }
}
