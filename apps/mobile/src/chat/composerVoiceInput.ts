export const VOICE_HOLD_HINT = '长按麦克风说话，松手结束。不会弹出输入键盘。'

export const VOICE_UNSUPPORTED_MESSAGE =
  '当前环境不支持应用内语音识别。请在网页端（Chrome / Edge / Safari）长按麦克风，或使用系统输入法语音。'

export function appendVoiceTranscript(base: string, incoming: string): string {
  const left = base.trimEnd()
  const right = incoming.trim()
  if (!right) return base
  if (!left) return right
  return `${left} ${right}`
}

export function speechRecognitionLocale(language: string): string {
  return language === 'en' ? 'en-US' : 'zh-CN'
}

type SpeechRecognitionLike = {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript?: string }>> }) => void) | null
  onerror: ((event: { error?: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike

function speechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof globalThis === 'undefined') return null
  const bag = globalThis as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return bag.SpeechRecognition ?? bag.webkitSpeechRecognition ?? null
}

export function canUseComposerVoiceInput(): boolean {
  return speechRecognitionCtor() != null
}

export type VoiceInputSession = {
  stop: () => void
}

export function startComposerVoiceInput(options: {
  lang: string
  onTranscript: (text: string) => void
  onError: (message: string) => void
  onEnd: () => void
}): { ok: true; session: VoiceInputSession } | { ok: false; message: string } {
  const Ctor = speechRecognitionCtor()
  if (!Ctor) return { ok: false, message: VOICE_UNSUPPORTED_MESSAGE }

  const recognition = new Ctor()
  recognition.lang = options.lang
  recognition.interimResults = true
  recognition.continuous = true
  let stopped = false

  recognition.onresult = (event) => {
    let committed = ''
    let interim = ''
    for (let i = 0; i < event.results.length; i += 1) {
      const item = event.results[i] as ArrayLike<{ transcript?: string }> & { isFinal?: boolean }
      const transcript = item?.[0]?.transcript ?? ''
      if (item.isFinal) committed = appendVoiceTranscript(committed, transcript)
      else interim = appendVoiceTranscript(interim, transcript)
    }
    options.onTranscript(appendVoiceTranscript(committed, interim))
  }
  recognition.onerror = (event) => {
    if (event.error === 'aborted' || event.error === 'no-speech') return
    options.onError(event.error === 'not-allowed' ? '未获得麦克风或语音识别权限' : '语音识别失败')
  }
  recognition.onend = () => {
    if (!stopped) options.onEnd()
  }

  try {
    recognition.start()
  } catch {
    return { ok: false, message: '无法启动语音识别' }
  }

  return {
    ok: true,
    session: {
      stop: () => {
        stopped = true
        try {
          recognition.stop()
        } catch {
          recognition.abort()
        }
        options.onEnd()
      },
    },
  }
}
