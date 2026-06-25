import { isIP } from 'node:net'

export class HttpFetchPolicyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HttpFetchPolicyError'
  }
}

function isPrivateIpv4(host: string): boolean {
  const parts = host.split('.').map((part) => Number.parseInt(part, 10))
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part) || part < 0 || part > 255)) {
    return false
  }

  const [a, b] = parts
  if (a === 10) return true
  if (a === 127) return true
  if (a === 0) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  return false
}

function isPrivateIpv6(host: string): boolean {
  const normalized = host.toLowerCase()
  if (normalized === '::1') return true
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true
  if (normalized.startsWith('fe80')) return true
  return false
}

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  if (!host) return true
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    return true
  }

  const ipVersion = isIP(host)
  if (ipVersion === 4) return isPrivateIpv4(host)
  if (ipVersion === 6) return isPrivateIpv6(host)
  return false
}

export function assertHttpFetchUrlAllowed(rawUrl: string): URL {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new HttpFetchPolicyError('URL 无效')
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new HttpFetchPolicyError('仅支持 http/https 协议')
  }

  if (parsed.username || parsed.password) {
    throw new HttpFetchPolicyError('URL 不允许包含用户名或密码')
  }

  if (isBlockedHostname(parsed.hostname)) {
    throw new HttpFetchPolicyError('不允许访问本地或内网地址')
  }

  return parsed
}
