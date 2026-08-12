export class WebSpeechTtsEngine {
  private utterance: SpeechSynthesisUtterance | null = null

  private get speech(): SpeechSynthesis | null {
    if (typeof globalThis === 'undefined') return null
    return (globalThis as { speechSynthesis?: SpeechSynthesis }).speechSynthesis ?? null
  }

  async speak(text: string, signal: AbortSignal): Promise<void> {
    const speech = this.speech
    const trimmed = text.trim()
    if (!speech || !trimmed) {
      throw new Error('当前环境不支持系统语音')
    }
    if (signal.aborted) return

    speech.cancel()
    await new Promise<void>((resolve, reject) => {
      const utter = new SpeechSynthesisUtterance(trimmed)
      this.utterance = utter
      const onAbort = () => {
        speech.cancel()
        cleanup()
        resolve()
      }
      const cleanup = () => {
        signal.removeEventListener('abort', onAbort)
        this.utterance = null
      }
      signal.addEventListener('abort', onAbort, { once: true })
      utter.onend = () => {
        cleanup()
        resolve()
      }
      utter.onerror = () => {
        cleanup()
        if (signal.aborted) resolve()
        else reject(new Error('系统语音播放失败'))
      }
      speech.speak(utter)
    })
  }

  pause(): void {
    this.speech?.pause()
  }

  resume(): void {
    this.speech?.resume()
  }

  cancel(): void {
    this.speech?.cancel()
    this.utterance = null
  }
}
