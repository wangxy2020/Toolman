import { parseLlmProxyChatBody, proxyChatCompletion } from '../../../src/chat/llmProxyRequest'

/** Same-origin LLM proxy so Expo web / Vercel can call providers without CORS. */
export async function POST(request: Request): Promise<Response> {
  try {
    const parsed = parseLlmProxyChatBody(await request.json())
    if ('error' in parsed) {
      return Response.json({ error: parsed.error }, { status: 400 })
    }
    const result = await proxyChatCompletion(parsed)
    return Response.json(result.body, { status: result.status })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'llm proxy failed' },
      { status: 500 },
    )
  }
}
