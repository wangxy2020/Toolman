import { communityHubProxyTarget } from '../../apps/mobile/src/features/communityHubProxy'

type NodeReq = {
  method?: string
  url?: string
  headers: Record<string, string | string[] | undefined>
  body?: unknown
}

type NodeRes = {
  status: (code: number) => NodeRes
  setHeader: (name: string, value: string) => void
  send: (body: unknown) => void
  json: (body: unknown) => void
  end: () => void
}

function header(req: NodeReq, name: string): string | undefined {
  const value = req.headers[name] ?? req.headers[name.toLowerCase()]
  return Array.isArray(value) ? value[0] : value
}

export default async function handler(req: NodeReq, res: NodeRes): Promise<void> {
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  try {
    const target = communityHubProxyTarget(new URL(req.url || '/health', 'http://localhost').href)
    const headers = new Headers()
    for (const name of ['accept', 'content-type', 'authorization', 'x-community-user-id']) {
      const value = header(req, name)
      if (value) headers.set(name, value)
    }
    const init: RequestInit = { method: req.method || 'GET', headers }
    if (req.method && !['GET', 'HEAD'].includes(req.method) && req.body != null) {
      init.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
      if (!headers.has('content-type')) headers.set('content-type', 'application/json')
    }
    const upstream = await fetch(target, init)
    const body = Buffer.from(await upstream.arrayBuffer())
    const contentType = upstream.headers.get('content-type')
    if (contentType) res.setHeader('content-type', contentType)
    res.setHeader('cache-control', 'no-store')
    res.status(upstream.status).send(body)
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error)
    res.status(502).json({
      ok: false,
      error: {
        message: /Failed to fetch|NetworkError|ECONNREFUSED|fetch failed/i.test(raw)
          ? '无法连接社区 Hub'
          : raw || '无法连接社区 Hub',
      },
    })
  }
}
