import { UniversalEdgeTTS } from 'edge-tts-universal'

const DEFAULT_EDGE_TTS_VOICE = 'zh-CN-XiaoxiaoNeural'
const MAX_CHARS = 4000

export type TtsSynthesizeInput = {
  text: string
  voice: string
  rate?: string
}

export function parseTtsSynthesizeBody(body: unknown): TtsSynthesizeInput | { error: string } {
  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : null
  const text = typeof record?.text === 'string' ? record.text.trim() : ''
  if (!text) return { error: 'text required' }
  const voice =
    typeof record?.voice === 'string' && record.voice.trim()
      ? record.voice.trim()
      : DEFAULT_EDGE_TTS_VOICE
  const rate = typeof record?.rate === 'string' && record.rate.trim() ? record.rate.trim() : undefined
  return { text: text.slice(0, MAX_CHARS), voice, ...(rate ? { rate } : {}) }
}

export async function synthesizeEdgeTtsAudio(input: TtsSynthesizeInput): Promise<{
  mimeType: string
  bytes: Uint8Array
}> {
  const tts = new UniversalEdgeTTS(input.text, input.voice, {
    ...(input.rate ? { rate: input.rate } : {}),
  })
  const result = await tts.synthesize()
  const audio = result.audio as Blob
  const buffer = await audio.arrayBuffer()
  return {
    mimeType: audio.type || 'audio/mpeg',
    bytes: new Uint8Array(buffer),
  }
}
