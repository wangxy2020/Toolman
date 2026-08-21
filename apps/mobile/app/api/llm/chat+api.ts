import { parseLlmProxyChatBody } from '../../../src/chat/llmProxyRequest'
import { proxyChatCompletion, proxyChatCompletionStream } from '../../../src/chat/llmProxyServer'

/** Same-origin LLM proxy so Expo web / Vercel can call providers without CORS. */
export async function POST(request: Request): Promise<Response> {
  try {
    const parsed = parseLlmProxyChatBody(await request.json())
    if ('error' in parsed) {
      return Response.json({ error: parsed.error }, { status: 400 })
    }
    if (parsed.stream) {
      const streamed = await proxyChatCompletionStream(parsed)
      if (!streamed.ok) {
        return Response.json(streamed.body, { status: streamed.status })
      }
      return new Response(streamed.response.body, {
        status: 200,
        headers: {
          'Content-Type': streamed.response.headers.get('Content-Type') || 'text/event-stream',
          'Cache-Control': 'no-cache',
        },
      })
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
