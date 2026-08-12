import { DEFAULT_EDGE_TTS_VOICE } from '@toolman/shared'
import { UniversalEdgeTTS } from 'edge-tts-universal'

/**
 * Server-side Microsoft Edge neural TTS.
 * Browsers cannot set the WebSocket headers Edge TTS requires; synthesize here instead.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as {
      text?: unknown
      voice?: unknown
      rate?: unknown
    }
    const text = typeof body.text === 'string' ? body.text.trim() : ''
    if (!text) {
      return Response.json({ error: 'text required' }, { status: 400 })
    }
    const voice =
      typeof body.voice === 'string' && body.voice.trim()
        ? body.voice.trim()
        : DEFAULT_EDGE_TTS_VOICE
    const rate = typeof body.rate === 'string' && body.rate.trim() ? body.rate.trim() : undefined

    const tts = new UniversalEdgeTTS(text.slice(0, 4000), voice, {
      ...(rate ? { rate } : {}),
    })
    const result = await tts.synthesize()
    const audio = result.audio as Blob
    const buffer = await audio.arrayBuffer()
    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': audio.type || 'audio/mpeg',
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Edge TTS synthesize failed',
      },
      { status: 500 },
    )
  }
}
