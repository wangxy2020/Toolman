export { configureSharedTts, getSharedTtsController, TtsController } from './tts-controller'
export { useAssistantTts } from './useAssistantTts'
export type { TtsPlaybackState, TtsProvider } from './tts-types'
export { WebSpeechTtsProvider } from './web-speech-tts-provider'
export { EdgeTtsProvider } from './edge-tts-provider'
export {
  CURATED_EDGE_TTS_VOICES,
  createTtsProvider,
  DEFAULT_TTS_PROVIDER_CONFIG,
  resolveCuratedEdgeTtsVoice,
} from './tts-provider-factory'
