/**
 * Capture a user gesture so HTMLAudioElement can play after async Edge TTS fetch.
 * Keep one shared element — Chrome will not let a *new* Audio() play after await.
 *
 * Do not clear `src` / call `load()` after the probe: that re-locks autoplay.
 */
const AUDIO_KEY = '__toolmanUnlockedAudio'
const WARMED_TTS_KEY = '__toolmanTtsWarmed'
const SPEECH_UNLOCKED_KEY = '__toolmanSpeechUnlocked'

/** 8 kHz mono 8-bit WAV with one silent sample — enough to satisfy play(). */
const SILENT_WAV =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA'

type AudioHost = typeof globalThis & {
  [AUDIO_KEY]?: HTMLAudioElement
  [WARMED_TTS_KEY]?: boolean
  [SPEECH_UNLOCKED_KEY]?: boolean
}

export function getSharedAudioElement(): HTMLAudioElement | null {
  if (typeof Audio === 'undefined') return null
  const host = globalThis as AudioHost
  if (!host[AUDIO_KEY]) {
    const audio = new Audio()
    audio.preload = 'auto'
    host[AUDIO_KEY] = audio
  }
  return host[AUDIO_KEY] ?? null
}

function warmSpeechVoices(): void {
  const speech = (globalThis as { speechSynthesis?: SpeechSynthesis }).speechSynthesis
  if (!speech) return
  speech.getVoices()
  speech.addEventListener('voiceschanged', () => undefined, { once: true })
}

function unlockSpeechSynthesis(): void {
  const host = globalThis as AudioHost
  if (host[SPEECH_UNLOCKED_KEY]) return
  const speech = (globalThis as { speechSynthesis?: SpeechSynthesis }).speechSynthesis
  if (!speech || typeof SpeechSynthesisUtterance === 'undefined') return
  host[SPEECH_UNLOCKED_KEY] = true
  try {
    const utter = new SpeechSynthesisUtterance(' ')
    utter.volume = 0
    utter.rate = 2
    speech.speak(utter)
    speech.cancel()
  } catch {
    host[SPEECH_UNLOCKED_KEY] = false
  }
}

function warmEdgeTtsApi(): void {
  if (typeof fetch === 'undefined') return
  const host = globalThis as AudioHost
  if (host[WARMED_TTS_KEY]) return
  host[WARMED_TTS_KEY] = true
  void fetch('/api/tts/synthesize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: '好', voice: 'zh-CN-XiaoxiaoNeural' }),
  }).catch(() => {
    host[WARMED_TTS_KEY] = false
  })
}

export function unlockAudioPlayback(): void {
  if (typeof window === 'undefined') return

  try {
    const AudioContextCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (AudioContextCtor) {
      const ctx = new AudioContextCtor()
      void ctx.resume().catch(() => undefined)
      const gain = ctx.createGain()
      gain.gain.value = 0
      const osc = ctx.createOscillator()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(0)
      osc.stop(0)
      void ctx.close().catch(() => undefined)
    }
  } catch {
    // ignore
  }

  const audio = getSharedAudioElement()
  if (audio) {
    try {
      if (!audio.src) audio.src = SILENT_WAV
      audio.muted = true
      void audio
        .play()
        .then(() => {
          audio.pause()
          audio.muted = false
          audio.currentTime = 0
        })
        .catch(() => {
          audio.muted = false
        })
    } catch {
      audio.muted = false
    }
  }

  warmSpeechVoices()
  unlockSpeechSynthesis()
  warmEdgeTtsApi()
}
