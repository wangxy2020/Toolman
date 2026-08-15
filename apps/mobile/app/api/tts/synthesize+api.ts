import { parseTtsSynthesizeBody, synthesizeEdgeTtsAudio } from '../../../src/voice/synthesizeEdgeTts'

/**
 * Server-side Microsoft Edge neural TTS.
 * Browsers cannot set the WebSocket headers Edge TTS requires; synthesize here instead.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const parsed = parseTtsSynthesizeBody(await request.json())
    if ('error' in parsed) {
      return Response.json({ error: parsed.error }, { status: 400 })
    }
    const { mimeType, bytes } = await synthesizeEdgeTtsAudio(parsed)
    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
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
