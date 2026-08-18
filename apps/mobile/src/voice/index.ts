export type { MobileTtsConfig, TtsPlaybackState, VoiceTtsEngine } from './types'
export {
  CURATED_EDGE_TTS_VOICES,
  DEFAULT_EDGE_TTS_VOICE,
  resolveCuratedEdgeTtsVoice,
} from './types'
export { getMobileTtsController, MobileTtsController } from './ttsController'
export { unlockAudioPlayback, getSharedAudioElement } from './audioUnlock'
export { sanitizeSpeakableText, isSpeakableUtterance } from './sanitizeSpeakableText'
