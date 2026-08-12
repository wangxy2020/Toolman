import { z } from 'zod'

export const VoiceTtsEngineSchema = z.enum(['edge', 'web-speech'])
export type VoiceTtsEngine = z.infer<typeof VoiceTtsEngineSchema>

export const DEFAULT_EDGE_TTS_VOICE = 'zh-CN-XiaoxiaoNeural'

/** Curated Microsoft Edge neural voices (same set as desktop agent settings). */
export const CURATED_EDGE_TTS_VOICES: Array<{ value: string; label: string }> = [
  { value: 'zh-CN-XiaoxiaoNeural', label: '晓晓（女声，自然）' },
  { value: 'zh-CN-YunyangNeural', label: '云扬（男声，播报）' },
  { value: 'zh-HK-HiuMaanNeural', label: '曉曼（粤语女声）' },
  { value: 'zh-TW-HsiaoChenNeural', label: '曉臻（台湾女声）' },
  { value: 'en-US-JennyNeural', label: 'Jenny（英语女声）' },
  { value: 'en-US-GuyNeural', label: 'Guy（英语男声）' },
]

export function resolveCuratedEdgeTtsVoice(voice?: string | null): string {
  const trimmed = voice?.trim()
  if (!trimmed) return DEFAULT_EDGE_TTS_VOICE
  return CURATED_EDGE_TTS_VOICES.some((item) => item.value === trimmed)
    ? trimmed
    : DEFAULT_EDGE_TTS_VOICE
}

export const VoiceSynthesizeInputSchema = z.object({
  text: z.string().min(1).max(4000),
  voice: z.string().min(1).default(DEFAULT_EDGE_TTS_VOICE),
  rate: z.string().optional(),
  volume: z.string().optional(),
  pitch: z.string().optional(),
})

export const VoiceSynthesizeOutputSchema = z.object({
  mimeType: z.string().min(1),
  audioBase64: z.string().min(1),
  voice: z.string().min(1),
})

export const VoiceListVoicesInputSchema = z.object({
  localePrefix: z.string().optional(),
})

export const VoiceListVoicesOutputSchema = z.object({
  voices: z.array(
    z.object({
      shortName: z.string(),
      friendlyName: z.string(),
      locale: z.string(),
      gender: z.string().optional(),
    }),
  ),
})

export type VoiceSynthesizeInput = z.infer<typeof VoiceSynthesizeInputSchema>
export type VoiceSynthesizeOutput = z.infer<typeof VoiceSynthesizeOutputSchema>
export type VoiceListVoicesInput = z.infer<typeof VoiceListVoicesInputSchema>
export type VoiceListVoicesOutput = z.infer<typeof VoiceListVoicesOutputSchema>
