import {
  DEFAULT_EDGE_TTS_VOICE,
  IpcChannel,
  type VoiceSynthesizeOutput,
} from '@toolman/shared'
import { ControllableAudioPlayback } from './audio-player'
import type { TtsProvider } from './tts-types'

export type EdgeTtsProviderOptions = {
  voice?: string
  rate?: string
}

/**
 * Main-process Edge neural TTS + renderer audio playback.
 * No API key / username / password — uses Microsoft Edge online neural voices.
 */
export class EdgeTtsProvider implements TtsProvider {
  readonly id = 'edge'
  private voice: string
  private rate?: string
  private readonly playback = new ControllableAudioPlayback()

  constructor(options: EdgeTtsProviderOptions = {}) {
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
    if (!trimmed) return
    if (signal.aborted) return

    const result = await window.api.invoke(IpcChannel.VoiceSynthesize, {
      text: trimmed,
      voice: this.voice,
      ...(this.rate ? { rate: this.rate } : {}),
    })
    if (signal.aborted) return
    if (!result.ok) {
      throw new Error(result.error.message || 'Edge TTS failed')
    }

    const data = result.data as VoiceSynthesizeOutput
    const binary = Uint8Array.from(atob(data.audioBase64), (char) => char.charCodeAt(0))
    const blob = new Blob([binary], { type: data.mimeType || 'audio/mpeg' })
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
