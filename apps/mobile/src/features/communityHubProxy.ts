import { DEFAULT_LOCAL_COMMUNITY_HUB_BASE_URL, OFFICIAL_TOOLMAN_HUB_URL } from '@toolman/shared'

export const COMMUNITY_HUB_PROXY_PREFIX = '/api/community-hub'

export function resolveCommunityHubProxyOrigin(): string {
  const fromEnv =
    process.env.COMMUNITY_HUB_UPSTREAM?.trim() ||
    process.env.EXPO_PUBLIC_COMMUNITY_HUB_UPSTREAM?.trim()
  if (fromEnv) return fromEnv.replace(/\/+$/, '')
  if (process.env.VERCEL) return OFFICIAL_TOOLMAN_HUB_URL
  return DEFAULT_LOCAL_COMMUNITY_HUB_BASE_URL
}

export function communityHubProxyTarget(
  requestUrl: string,
  origin = resolveCommunityHubProxyOrigin(),
): string {
  const url = new URL(requestUrl)
  const rest = url.pathname.startsWith(COMMUNITY_HUB_PROXY_PREFIX)
    ? url.pathname.slice(COMMUNITY_HUB_PROXY_PREFIX.length)
    : url.pathname
  const path = rest.startsWith('/') ? rest : `/${rest}`
  return `${origin.replace(/\/+$/, '')}${path || '/health'}${url.search}`
}

function forwardHeaders(request: Request): Headers {
  const headers = new Headers()
  for (const name of ['accept', 'content-type', 'authorization', 'x-community-user-id']) {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  }
  return headers
}

export async function proxyCommunityHubRequest(request: Request): Promise<Response> {
  try {
    const init: RequestInit = {
      method: request.method,
      headers: forwardHeaders(request),
    }
    if (request.method !== 'GET' && request.method !== 'HEAD' && request.method !== 'OPTIONS') {
      init.body = await request.arrayBuffer()
    }
    const upstream = await fetch(communityHubProxyTarget(request.url), init)
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
