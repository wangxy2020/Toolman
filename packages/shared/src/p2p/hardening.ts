export function isInviteExpired(expiresAt: number | undefined, now = Date.now()): boolean {
  return typeof expiresAt === 'number' && Number.isFinite(expiresAt) && expiresAt <= now
}

export function iceServersHaveTurn(
  servers: Array<{ urls: string | string[] }> | undefined,
): boolean {
  if (!servers?.length) return false
  return servers.some((server) => {
    const urls = Array.isArray(server.urls) ? server.urls : [server.urls]
    return urls.some((url) => url.toLowerCase().startsWith('turn:'))
  })
}

export function describeP2pJoinFailure(input: {
  message: string
  hasTurn?: boolean
}): string {
  const raw = input.message.trim() || '直连失败'
  const timeout = /超时|timeout|ice /i.test(raw)
  if (timeout && input.hasTurn === false) {
    return '直连超时。当前邀请没有 TURN 中继，跨公网可能失败，请让群主重新生成邀请，或改用同一网络 / Tailscale。'
  }
  if (timeout) {
    return '直连超时。TURN 中继未能打通，请稍后重试；也可先走加密信箱收发。'
  }
  if (/failed to fetch|无法连接|econnrefused|network/i.test(raw)) {
    return `无法连接群主电脑：${raw}`
  }
  return raw
}

/** Gateway may only forward events for workspaces it belongs to. */
export function canForwardWorkspaceAsGateway(localIsMember: boolean): boolean {
  return localIsMember
}

export function admitMailboxProposal(input: {
  senderCanWrite: boolean
  duplicate: boolean
}): { ok: true } | { ok: false; reason: 'readonly' | 'replay' } {
  if (!input.senderCanWrite) return { ok: false, reason: 'readonly' }
  if (input.duplicate) return { ok: false, reason: 'replay' }
  return { ok: true }
}

export type P2pPathCounters = {
  meshSends: number
  mailboxPuts: number
  mailboxPullApplied: number
  joinDirectOk: number
  joinFailed: number
  lastCatchUpMs: number | null
}

export function emptyP2pPathCounters(): P2pPathCounters {
  return {
    meshSends: 0,
    mailboxPuts: 0,
    mailboxPullApplied: 0,
    joinDirectOk: 0,
    joinFailed: 0,
    lastCatchUpMs: null,
  }
}

export function formatP2pPathMetrics(counters: P2pPathCounters): string {
  const catchUp =
    counters.lastCatchUpMs != null ? ` · 最近补齐 ${counters.lastCatchUpMs}ms` : ''
  return `直连成功 ${counters.joinDirectOk} / 失败 ${counters.joinFailed} · 网格发送 ${counters.meshSends} · 信箱投递 ${counters.mailboxPuts} · 信箱补齐 ${counters.mailboxPullApplied}${catchUp}`
}
