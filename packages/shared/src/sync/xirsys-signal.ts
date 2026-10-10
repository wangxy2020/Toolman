/** Xirsys Signaling V2 helpers. The account secret never enters these payloads. */

export const PERSONAL_SIGNAL_WIRE_OP = 'psync'
/** Phone tokens last a week so a later off-LAN session can rejoin the room. */
export const PERSONAL_SIGNAL_TOKEN_TTL_SEC = 7 * 24 * 60 * 60

export function xirsysSignalHostUrl(apiPath: string): string {
  return `${apiPath.replace(/\/+$/, '')}/_host?type=signal`
}

export function xirsysSignalTokenUrl(
  apiPath: string,
  channel: string,
  peerId: string,
  expireSec: number,
): string {
  const base = apiPath.replace(/\/+$/, '')
  return `${base}/_token/${encodeURIComponent(channel)}?k=${encodeURIComponent(peerId)}&expire=${expireSec}`
}

/** `host` from `_host` plus the per-peer token. Hosts that already end in `/v2` are not doubled. */
export function xirsysSignalSocketUrl(host: string, token: string): string {
  const trimmedHost = host.trim().replace(/\/+$/, '')
  const trimmedToken = token.trim()
  if (!trimmedHost || !trimmedToken) {
    throw new Error('signal host and token required')
  }
  const encoded = encodeURIComponent(trimmedToken)
  if (/\/v2$/i.test(trimmedHost)) return `${trimmedHost}/${encoded}`
  return `${trimmedHost}/v2/${encoded}`
}

export function readXirsysOkString(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const record = payload as { s?: unknown; v?: unknown }
  if (record.s !== 'ok') return null
  if (typeof record.v === 'string' && record.v.trim()) return record.v.trim()
  if (record.v && typeof record.v === 'object') {
    const nested = record.v as Record<string, unknown>
    for (const key of ['host', 'signal', 'url', 'token']) {
      const value = nested[key]
      if (typeof value === 'string' && value.trim()) return value.trim()
    }
  }
  return null
}

export function encodePersonalSignalWire(input: {
  from: string
  to: string
  ciphertextB64: string
}): string {
  return JSON.stringify({
    t: 'u',
    m: { f: input.from, t: input.to, o: PERSONAL_SIGNAL_WIRE_OP },
    p: { ciphertextB64: input.ciphertextB64 },
  })
}

/** Directed `psync` user messages. Own echoes and other ops are ignored. */
export function readPersonalSignalWire(
  raw: string,
  localPeerId: string,
): { from: string; ciphertextB64: string } | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const message = parsed as {
    t?: unknown
    m?: { f?: unknown; t?: unknown; o?: unknown }
    p?: { ciphertextB64?: unknown }
  }
  if (message.t !== 'u') return null
  if (message.m?.o !== PERSONAL_SIGNAL_WIRE_OP) return null
  const from = typeof message.m.f === 'string' ? message.m.f.trim() : ''
  if (!from || from === localPeerId) return null
  const to = typeof message.m.t === 'string' ? message.m.t.trim() : ''
  if (to && to !== localPeerId) return null
  const ciphertextB64 =
    typeof message.p?.ciphertextB64 === 'string' ? message.p.ciphertextB64.trim() : ''
  if (!ciphertextB64) return null
  return { from, ciphertextB64 }
}
