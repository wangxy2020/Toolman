export class WebSpeechTtsEngine {
  private utterance: SpeechSynthesisUtterance | null = null

  private get speech(): SpeechSynthesis | null {
    if (typeof globalThis === 'undefined') return null
    return (globalThis as { speechSynthesis?: SpeechSynthesis }).speechSynthesis ?? null
  }

  private async ensureVoices(speech: SpeechSynthesis): Promise<SpeechSynthesisVoice[]> {
    const existing = speech.getVoices()
    if (existing.length > 0) return existing
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => resolve(), 2000)
      speech.addEventListener(
        'voiceschanged',
        () => {
          clearTimeout(timer)
          resolve()
        },
        { once: true },
      )
    })
    return speech.getVoices()
  }

  private pickVoice(
    voices: SpeechSynthesisVoice[],
    text: string,
  ): SpeechSynthesisVoice | undefined {
    if (voices.length === 0) return undefined
    const wantZh = /[\u4e00-\u9fff]/.test(text)
    const matchLang = (prefix: string) =>
      voices.find((voice) => voice.lang.toLowerCase().startsWith(prefix))
    if (wantZh) return matchLang('zh') ?? voices[0]
    return matchLang('en') ?? voices[0]
  }

  async speak(text: string, signal: AbortSignal): Promise<void> {
    const speech = this.speech
    const trimmed = text.trim()
    if (!speech || !trimmed) {
      throw new Error('当前环境不支持系统语音')
    }
    if (signal.aborted) return

    const voices = await this.ensureVoices(speech)
    if (signal.aborted) return
    speech.cancel()
    await new Promise<void>((resolve, reject) => {
      const utter = new SpeechSynthesisUtterance(trimmed)
      const voice = this.pickVoice(voices, trimmed)
      if (voice) utter.voice = voice
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
