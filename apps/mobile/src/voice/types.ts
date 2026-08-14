import {
  CURATED_EDGE_TTS_VOICES,
  DEFAULT_EDGE_TTS_VOICE,
  resolveCuratedEdgeTtsVoice,
  type VoiceTtsEngine,
} from '@toolman/shared'

export type { VoiceTtsEngine }
export { CURATED_EDGE_TTS_VOICES, DEFAULT_EDGE_TTS_VOICE, resolveCuratedEdgeTtsVoice }

export type TtsPlaybackState = 'idle' | 'playing' | 'paused'

export type MobileTtsConfig = {
  engine: VoiceTtsEngine
  voice: string
}
