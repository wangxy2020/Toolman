import { DEFAULT_EDGE_TTS_VOICE, type VoiceTtsEngine } from '@toolman/shared'
import { EdgeTtsProvider } from './edge-tts-provider'
import { FallbackTtsProvider } from './fallback-tts-provider'
import type { TtsProvider } from './tts-types'
import { WebSpeechTtsProvider } from './web-speech-tts-provider'

export type TtsProviderConfig = {
  engine: VoiceTtsEngine
  voice?: string
}

/** Curated voices shown in agent settings (no network required). */
export const CURATED_EDGE_TTS_VOICES: Array<{ value: string; label: string }> = [
  { value: 'zh-CN-XiaoxiaoNeural', label: '晓晓（女声，自然）' },
  { value: 'zh-CN-YunyangNeural', label: '云扬（男声，播报）' },
  { value: 'zh-HK-HiuMaanNeural', label: '曉曼（粤语女声）' },
  { value: 'zh-TW-HsiaoChenNeural', label: '曉臻（台湾女声）' },
  { value: 'en-US-JennyNeural', label: 'Jenny（英语女声）' },
  { value: 'en-US-GuyNeural', label: 'Guy（英语男声）' },
]

/** Map unknown / retired voices (e.g. Xiaochen) back to the default 晓晓. */
export function resolveCuratedEdgeTtsVoice(voice?: string | null): string {
  const trimmed = voice?.trim()
  if (!trimmed) return DEFAULT_EDGE_TTS_VOICE
  return CURATED_EDGE_TTS_VOICES.some((item) => item.value === trimmed)
    ? trimmed
    : DEFAULT_EDGE_TTS_VOICE
}

export function createTtsProvider(config: TtsProviderConfig): TtsProvider {
  const voice = resolveCuratedEdgeTtsVoice(config.voice)
  if (config.engine === 'web-speech') {
    return new WebSpeechTtsProvider()
  }
  // Edge neural + automatic Web Speech fallback when offline / blocked.
  return new FallbackTtsProvider(new EdgeTtsProvider({ voice }))
}

export const DEFAULT_TTS_PROVIDER_CONFIG: TtsProviderConfig = {
  engine: 'edge',
  voice: DEFAULT_EDGE_TTS_VOICE,
}
