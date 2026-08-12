import {
  CURATED_EDGE_TTS_VOICES,
  DEFAULT_EDGE_TTS_VOICE,
  resolveCuratedEdgeTtsVoice,
  type VoiceTtsEngine,
} from '@toolman/shared'
import { EdgeTtsProvider } from './edge-tts-provider'
import { FallbackTtsProvider } from './fallback-tts-provider'
import type { TtsProvider } from './tts-types'
import { WebSpeechTtsProvider } from './web-speech-tts-provider'

export type TtsProviderConfig = {
  engine: VoiceTtsEngine
  voice?: string
}

export { CURATED_EDGE_TTS_VOICES, resolveCuratedEdgeTtsVoice }

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
