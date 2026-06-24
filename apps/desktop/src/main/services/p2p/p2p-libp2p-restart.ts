export const LIBP2P_RESTART_MIN_DELAY_MS = 1_000
export const LIBP2P_RESTART_MAX_DELAY_MS = 60_000

export function nextLibp2pRestartDelayMs(attempt: number): number {
  const normalizedAttempt = Math.max(1, attempt)
  const exponent = normalizedAttempt - 1
  return Math.min(
    LIBP2P_RESTART_MAX_DELAY_MS,
    LIBP2P_RESTART_MIN_DELAY_MS * 2 ** exponent,
  )
}

export interface Libp2pRestartStatus {
  enabled: boolean
  attempt: number
  nextDelayMs: number | null
  lastReason: string | null
  lastRestartAt: number | null
}

type Libp2pRestartListener = () => void | Promise<void>

const restartListeners = new Set<Libp2pRestartListener>()

export function registerLibp2pRestartListener(listener: Libp2pRestartListener): () => void {
  restartListeners.add(listener)
  return () => {
    restartListeners.delete(listener)
  }
}

export async function notifyLibp2pRestartListeners(): Promise<void> {
  for (const listener of restartListeners) {
    await Promise.resolve(listener()).catch(() => undefined)
  }
}

export function createInitialLibp2pRestartStatus(enabled: boolean): Libp2pRestartStatus {
  return {
    enabled,
    attempt: 0,
    nextDelayMs: null,
    lastReason: null,
    lastRestartAt: null,
  }
}
