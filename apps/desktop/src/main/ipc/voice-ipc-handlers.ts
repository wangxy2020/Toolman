import { IpcChannel } from '@toolman/shared'
import { listEdgeTtsVoices, synthesizeEdgeTts } from '../services/voice/edge-tts.service'
import type { HandlerFn } from './handlers/ipc-handler-map/types'

export const voiceIpcHandlers: Partial<Record<IpcChannel, HandlerFn>> = {
  [IpcChannel.VoiceSynthesize]: async (input) => synthesizeEdgeTts(input),
  [IpcChannel.VoiceListVoices]: async (input) => listEdgeTtsVoices(input),
}
