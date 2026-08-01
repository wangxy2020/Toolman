import type { TtsProvider } from './tts-types'

/** Offline fallback: Chromium `speechSynthesis` (robotic; ignores Edge voice selection). */
export class WebSpeechTtsProvider implements TtsProvider {
  readonly id = 'web-speech'
  private current: SpeechSynthesisUtterance | null = null

  speak(text: string, signal: AbortSignal): Promise<void> {
    const trimmed = text.trim()
    if (!trimmed) return Promise.resolve()
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      return Promise.reject(new Error('Web Speech API unavailable'))
    }

    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        resolve()
        return
      }

      const utterance = new SpeechSynthesisUtterance(trimmed)
      this.current = utterance

      const onAbort = () => {
        window.speechSynthesis.cancel()
        cleanup()
        resolve()
      }

      const cleanup = () => {
        signal.removeEventListener('abort', onAbort)
        if (this.current === utterance) this.current = null
      }

      utterance.onend = () => {
        cleanup()
        resolve()
      }
      utterance.onerror = (event) => {
        cleanup()
        const err = event.error
        if (err === 'interrupted' || err === 'canceled' || signal.aborted) {
          resolve()
          return
        }
        reject(new Error(`speechSynthesis error: ${err}`))
      }

      signal.addEventListener('abort', onAbort, { once: true })
      window.speechSynthesis.speak(utterance)
    })
  }

  pause(): void {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.pause()
    }
  }

  resume(): void {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.resume()
    }
  }

  cancel(): void {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }
    this.current = null
  }
}
