import { DEFAULT_EDGE_TTS_VOICE } from '@toolman/shared'
import { ControllableAudioPlayback } from './audioPlayback'

export type EdgeTtsSpeakOptions = {
  voice?: string
  rate?: string
}

/**
 * Microsoft Edge neural TTS via server API (same voices as desktop).
 * Direct browser WebSocket to Edge TTS is blocked outside Microsoft Edge;
 * the Expo API route synthesizes in Node and returns audio/mpeg.
 */
export class EdgeTtsEngine {
  private voice: string
  private rate?: string
  private readonly playback = new ControllableAudioPlayback()

  constructor(options: EdgeTtsSpeakOptions = {}) {
    this.voice = options.voice?.trim() || DEFAULT_EDGE_TTS_VOICE
    this.rate = options.rate
  }

  setVoice(voice: string): void {
    this.voice = voice.trim() || DEFAULT_EDGE_TTS_VOICE
  }

  getVoice(): string {
    return this.voice
  }

  async speak(text: string, signal: AbortSignal): Promise<void> {
    const trimmed = text.trim()
    if (!trimmed || signal.aborted) return

    const response = await fetch('/api/tts/synthesize', {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: trimmed.slice(0, 4000),
        voice: this.voice,
        ...(this.rate ? { rate: this.rate } : {}),
      }),
    })

    if (signal.aborted) return
    if (!response.ok) {
      let detail = ''
      try {
        const json = (await response.json()) as { error?: string }
        detail = json.error ? `: ${json.error}` : ''
      } catch {
        detail = ` (${response.status})`
      }
      throw new Error(`Edge TTS 合成失败${detail}`)
    }

    const blob = await response.blob()
    if (signal.aborted) return
    await this.playback.play(blob, signal)
  }

  pause(): void {
    this.playback.pause()
  }

  resume(): void {
    this.playback.resume()
  }

  cancel(): void {
    this.playback.stop()
  }
}
