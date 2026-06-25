const DEFAULT_REPLAY_WINDOW_MS = 5 * 60 * 1_000
const MAX_TRACKED_ENTRIES = 2_000

type ReplayKey = string

const seenAtByKey = new Map<ReplayKey, number>()

function pruneReplayGuard(now: number, windowMs: number): void {
  if (seenAtByKey.size <= MAX_TRACKED_ENTRIES) {
    for (const [key, at] of seenAtByKey) {
      if (now - at > windowMs) {
        seenAtByKey.delete(key)
      }
    }
    return
  }

  const cutoff = now - windowMs
  for (const [key, at] of seenAtByKey) {
    if (at < cutoff) {
      seenAtByKey.delete(key)
    }
  }

  if (seenAtByKey.size > MAX_TRACKED_ENTRIES) {
    const overflow = seenAtByKey.size - MAX_TRACKED_ENTRIES
    const keys = [...seenAtByKey.entries()]
      .sort((a, b) => a[1] - b[1])
      .slice(0, overflow)
      .map(([key]) => key)
    for (const key of keys) {
      seenAtByKey.delete(key)
    }
  }
}

export function checkReplayGuard(input: {
  scope: string
  signerId: string
  at: number
  payloadHash: string
  windowMs?: number
  now?: number
}): { ok: true } | { ok: false; reason: string } {
  const now = input.now ?? Date.now()
  const windowMs = input.windowMs ?? DEFAULT_REPLAY_WINDOW_MS
  if (!Number.isFinite(input.at) || input.at <= 0) {
    return { ok: false, reason: 'missing timestamp' }
  }
  if (Math.abs(now - input.at) > windowMs) {
    return { ok: false, reason: 'timestamp outside replay window' }
  }

  pruneReplayGuard(now, windowMs)
  const key = `${input.scope}:${input.signerId}:${input.payloadHash}`
  const lastAt = seenAtByKey.get(key)
  if (lastAt !== undefined && input.at <= lastAt) {
    return { ok: false, reason: 'replay detected' }
  }

  seenAtByKey.set(key, input.at)
  return { ok: true }
}

export function resetReplayGuardForTests(): void {
  seenAtByKey.clear()
}
