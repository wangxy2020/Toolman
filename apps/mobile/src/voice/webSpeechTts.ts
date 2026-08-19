let expoSpeechPromise: Promise<typeof import('expo-speech') | null> | null = null

async function loadExpoSpeech(): Promise<typeof import('expo-speech') | null> {
  if (!expoSpeechPromise) {
    expoSpeechPromise = import('expo-speech').catch(() => null)
  }
  return expoSpeechPromise
}

export class WebSpeechTtsEngine {
  private utterance: SpeechSynthesisUtterance | null = null
  private usingExpo = false

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

  private pickExpoLanguage(text: string): string {
    return /[\u4e00-\u9fff]/.test(text) ? 'zh-CN' : 'en-US'
  }

  async speak(text: string, signal: AbortSignal): Promise<void> {
    const trimmed = text.trim()
    if (!trimmed) return
    if (signal.aborted) return

    const speech = this.speech
    if (speech) {
      await this.speakBrowser(speech, trimmed, signal)
      return
    }

    const expo = await loadExpoSpeech()
    if (!expo) {
      throw new Error('当前环境不支持系统语音')
    }
    await this.speakExpo(expo, trimmed, signal)
  }

  private async speakBrowser(
    speech: SpeechSynthesis,
    trimmed: string,
    signal: AbortSignal,
  ): Promise<void> {
    const voices = await this.ensureVoices(speech)
    if (signal.aborted) return
    speech.cancel()
    this.usingExpo = false
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

  private async speakExpo(
    expo: typeof import('expo-speech'),
    trimmed: string,
    signal: AbortSignal,
  ): Promise<void> {
    if (signal.aborted) return
    this.usingExpo = true
    await expo.stop()
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        void expo.stop()
        cleanup()
        resolve()
      }
      const cleanup = () => {
        signal.removeEventListener('abort', onAbort)
        this.usingExpo = false
      }
      signal.addEventListener('abort', onAbort, { once: true })
      expo.speak(trimmed, {
        language: this.pickExpoLanguage(trimmed),
        onDone: () => {
          cleanup()
          resolve()
        },
        onStopped: () => {
          cleanup()
          resolve()
        },
        onError: () => {
          cleanup()
          if (signal.aborted) resolve()
          else reject(new Error('系统语音播放失败'))
        },
      })
    })
  }

  pause(): void {
    if (this.usingExpo) {
      void loadExpoSpeech().then((expo) => {
        void expo?.pause()
      })
      return
    }
    this.speech?.pause()
  }

  resume(): void {
    if (this.usingExpo) {
      void loadExpoSpeech().then((expo) => {
        void expo?.resume()
      })
      return
    }
    this.speech?.resume()
  }

  cancel(): void {
    if (this.usingExpo) {
      void loadExpoSpeech().then((expo) => {
        void expo?.stop()
      })
      this.usingExpo = false
    }
    this.speech?.cancel()
    this.utterance = null
  }
}
