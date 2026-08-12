export type { MobileTtsConfig, TtsPlaybackState, VoiceTtsEngine } from './types'
export {
  CURATED_EDGE_TTS_VOICES,
  DEFAULT_EDGE_TTS_VOICE,
  DEFAULT_MOBILE_TTS_CONFIG,
  resolveCuratedEdgeTtsVoice,
} from './types'
export { getMobileTtsController, MobileTtsController } from './ttsController'
export { unlockAudioPlayback } from './audioUnlock'
export { sanitizeSpeakableText, isSpeakableUtterance } from './sanitizeSpeakableText'
