import { DEFAULT_LOCAL_COMMUNITY_HUB_BASE_URL } from '@toolman/shared'

const HUB_ORIGIN = DEFAULT_LOCAL_COMMUNITY_HUB_BASE_URL
const PROXY_PREFIX = '/api/community-hub'

function hubTarget(request: Request): string {
  const url = new URL(request.url)
  const rest = url.pathname.startsWith(PROXY_PREFIX)
    ? url.pathname.slice(PROXY_PREFIX.length)
    : url.pathname
  const path = rest.startsWith('/') ? rest : `/${rest}`
  return `${HUB_ORIGIN}${path || '/health'}${url.search}`
}

function forwardHeaders(request: Request): Headers {
  const headers = new Headers()
  for (const name of ['accept', 'content-type', 'authorization', 'x-community-user-id']) {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  }
  return headers
}

async function proxy(request: Request): Promise<Response> {
  try {
    const init: RequestInit = {
      method: request.method,
      headers: forwardHeaders(request),
    }
    if (request.method !== 'GET' && request.method !== 'HEAD' && request.method !== 'OPTIONS') {
      init.body = await request.arrayBuffer()
    }
    const upstream = await fetch(hubTarget(request), init)
    const body = await upstream.arrayBuffer()
    const headers = new Headers()
    const contentType = upstream.headers.get('content-type')
    if (contentType) headers.set('content-type', contentType)
    headers.set('cache-control', 'no-store')
    return new Response(body, { status: upstream.status, headers })
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error)
    const message = /Failed to fetch|NetworkError|ECONNREFUSED|fetch failed/i.test(raw)
      ? '无法连接社区 Hub'
      : raw || '无法连接社区 Hub'
    return Response.json(
      {
        ok: false,
        error: { message },
      },
      { status: 502 },
    )
  }
}

export async function GET(request: Request): Promise<Response> {
  return proxy(request)
}

export async function POST(request: Request): Promise<Response> {
  return proxy(request)
}

export async function PATCH(request: Request): Promise<Response> {
  return proxy(request)
}

export async function PUT(request: Request): Promise<Response> {
  return proxy(request)
}

export async function DELETE(request: Request): Promise<Response> {
  return proxy(request)
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204 })
}
