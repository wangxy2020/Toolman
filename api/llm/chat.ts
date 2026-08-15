import { parseLlmProxyChatBody, proxyChatCompletion } from '../../apps/mobile/src/chat/llmProxyRequest'

type NodeRes = {
  status: (code: number) => NodeRes
  json: (body: unknown) => void
}

export default async function handler(
  req: { method?: string; body?: unknown },
  res: NodeRes,
): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' })
    return
  }
  try {
    const parsed = parseLlmProxyChatBody(req.body)
    if ('error' in parsed) {
      res.status(400).json({ error: parsed.error })
      return
    }
    const result = await proxyChatCompletion(parsed)
    res.status(result.status).json(result.body)
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'llm proxy failed',
    })
  }
}
