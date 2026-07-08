import net from 'node:net'

const probeCache = new Map<string, { reachable: boolean; checkedAt: number }>()
const REACHABLE_TTL_MS = 30_000
const UNREACHABLE_TTL_MS = 3_000
const DEFAULT_PROBE_TIMEOUT_MS = 800

function probeTcpPort(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port })
    const timer = setTimeout(() => {
      socket.destroy()
      resolve(false)
    }, timeoutMs)
    const finish = (reachable: boolean) => {
      clearTimeout(timer)
      socket.destroy()
      resolve(reachable)
    }
    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
  })
}

function healthUrl(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/$/, '')
  return `${normalized}/health`
}

/** Quick check whether opendataloader-pdf-hybrid is listening (avoids JVM exit 2). */
export async function isHybridServerReachable(
  url: string,
  timeoutMs = DEFAULT_PROBE_TIMEOUT_MS,
  options?: { bypassCache?: boolean },
): Promise<boolean> {
  const normalized = url.trim().replace(/\/$/, '')
  if (!normalized) return false

  if (!options?.bypassCache) {
    const cached = probeCache.get(normalized)
    const ttl = cached?.reachable ? REACHABLE_TTL_MS : UNREACHABLE_TTL_MS
    if (cached && Date.now() - cached.checkedAt < ttl) {
      return cached.reachable
    }
  }

  let reachable = false
  try {
    const parsed = new URL(normalized)
    const port = parsed.port
      ? Number(parsed.port)
      : parsed.protocol === 'https:'
        ? 443
        : 80
    const host = parsed.hostname
    const tcpTimeoutMs = Math.min(300, timeoutMs)
    if (await probeTcpPort(host, port, tcpTimeoutMs)) {
      const response = await fetch(healthUrl(normalized), {
        method: 'GET',
        signal: AbortSignal.timeout(Math.max(200, timeoutMs - tcpTimeoutMs)),
      })
      reachable = response.ok
    }
  } catch {
    reachable = false
  }

  probeCache.set(normalized, { reachable, checkedAt: Date.now() })
  return reachable
}

export function clearHybridServerProbeCache(): void {
  probeCache.clear()
}
