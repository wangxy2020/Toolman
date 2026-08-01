/**
 * Pluggable TTS provider. Edge neural (main) or Web Speech (fallback / offline).
 */
export interface TtsProvider {
  readonly id: string
  /** Speak one sentence; resolves when playback finishes or is cancelled/stopped. */
  speak(text: string, signal: AbortSignal): Promise<void>
  /** Pause current utterance / audio (no-op if idle). */
  pause(): void
  /** Resume after pause (no-op if not paused). */
  resume(): void
  /** Immediately stop current utterance / audio. */
  cancel(): void
}

export type TtsPlaybackState = 'idle' | 'playing' | 'paused'

export type TtsControllerListener = (state: {
  playingMessageId: string | null
  playbackState: TtsPlaybackState
  /** Last engine that actually produced audio (`edge` / `web-speech` / null). */
  activeEngine: string | null
  /** Last synthesize/play error (e.g. Edge offline → fell back). */
  lastError: string | null
}) => void
