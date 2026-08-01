import {
  DEFAULT_EDGE_TTS_VOICE,
  VoiceListVoicesInputSchema,
  VoiceListVoicesOutputSchema,
  VoiceSynthesizeInputSchema,
  VoiceSynthesizeOutputSchema,
  ipcErr,
  ipcOk,
  toErrorMessage,
  type IpcResult,
  type VoiceListVoicesInput,
  type VoiceListVoicesOutput,
  type VoiceSynthesizeInput,
  type VoiceSynthesizeOutput,
} from '@toolman/shared'
import { UniversalEdgeTTS, listVoicesUniversal } from 'edge-tts-universal'

export async function synthesizeEdgeTts(
  rawInput: unknown,
): Promise<IpcResult<VoiceSynthesizeOutput>> {
  try {
    const input = VoiceSynthesizeInputSchema.parse(rawInput) as VoiceSynthesizeInput
    const voice = input.voice?.trim() || DEFAULT_EDGE_TTS_VOICE
    const tts = new UniversalEdgeTTS(input.text, voice, {
      ...(input.rate ? { rate: input.rate } : {}),
      ...(input.volume ? { volume: input.volume } : {}),
      ...(input.pitch ? { pitch: input.pitch } : {}),
    })
    const result = await tts.synthesize()
    const bytes = Buffer.from(await result.audio.arrayBuffer())
    const mimeType = result.audio.type || 'audio/mpeg'
    const output = VoiceSynthesizeOutputSchema.parse({
      mimeType,
      audioBase64: bytes.toString('base64'),
      voice,
    })
    return ipcOk(output)
  } catch (error) {
    return ipcErr({
      code: 'PROVIDER_ERROR',
      message: toErrorMessage(error, 'Edge TTS 合成失败'),
      retryable: true,
    })
  }
}

export async function listEdgeTtsVoices(
  rawInput: unknown,
): Promise<IpcResult<VoiceListVoicesOutput>> {
  try {
    const input = VoiceListVoicesInputSchema.parse(rawInput ?? {}) as VoiceListVoicesInput
    const all = await listVoicesUniversal()
    const prefix = input.localePrefix?.trim().toLowerCase()
    const filtered = prefix
      ? all.filter((voice) => voice.Locale?.toLowerCase().startsWith(prefix))
      : all
    const voices = filtered
      .map((voice) => ({
        shortName: voice.ShortName,
        friendlyName: voice.FriendlyName || voice.ShortName,
        locale: voice.Locale,
        gender: voice.Gender,
      }))
      .sort((a, b) => a.shortName.localeCompare(b.shortName))
    return ipcOk(VoiceListVoicesOutputSchema.parse({ voices }))
  } catch (error) {
    return ipcErr({
      code: 'PROVIDER_ERROR',
      message: toErrorMessage(error, '获取 Edge TTS 音色失败'),
      retryable: true,
    })
  }
}
