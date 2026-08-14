export type { MobileTtsConfig, TtsPlaybackState, VoiceTtsEngine } from './types'
export {
  CURATED_EDGE_TTS_VOICES,
  DEFAULT_EDGE_TTS_VOICE,
  resolveCuratedEdgeTtsVoice,
} from './types'
export { getMobileTtsController, MobileTtsController } from './ttsController'
export { unlockAudioPlayback } from './audioUnlock'
export { sanitizeSpeakableText, isSpeakableUtterance } from './sanitizeSpeakableText'
