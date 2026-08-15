import {
  parseTtsSynthesizeBody,
  synthesizeEdgeTtsAudio,
} from '../../apps/mobile/src/voice/synthesizeEdgeTts'

type NodeRes = {
  status: (code: number) => NodeRes
  setHeader: (name: string, value: string) => void
  json: (body: unknown) => void
  send: (body: Buffer) => void
  end: () => void
}

/**
 * Vercel Node function — same Edge neural TTS as desktop / Expo Go.
 * Static Expo export has no +api routes; this restores /api/tts/synthesize.
 */
export default async function handler(
  req: { method?: string; body?: unknown },
  res: NodeRes,
): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' })
    return
  }

  try {
    const parsed = parseTtsSynthesizeBody(req.body)
    if ('error' in parsed) {
      res.status(400).json({ error: parsed.error })
      return
    }
    const { mimeType, bytes } = await synthesizeEdgeTtsAudio(parsed)
    res.setHeader('Content-Type', mimeType)
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).send(Buffer.from(bytes))
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Edge TTS synthesize failed',
    })
  }
}
