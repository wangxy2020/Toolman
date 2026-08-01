import { z } from 'zod'

export const VoiceTtsEngineSchema = z.enum(['edge', 'web-speech'])
export type VoiceTtsEngine = z.infer<typeof VoiceTtsEngineSchema>

export const DEFAULT_EDGE_TTS_VOICE = 'zh-CN-XiaoxiaoNeural'

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
