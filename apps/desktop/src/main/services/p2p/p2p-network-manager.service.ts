import { toErrorMessage } from '@toolman/shared'
import { recordDiagnosticEvent } from '../diagnostics-log'
import { Libp2pBridge } from './libp2p-bridge'
import {
  createInitialLibp2pRestartStatus,
} from './p2p-libp2p-restart'
import { ensureLibp2pDependentPubsubResync } from './p2p-libp2p-resync'
import {
  bootstrapLibp2pNetwork,
  clearLibp2pRestartTimer,
  getLibp2pRestartStatus,
  getShutdownRequested,
  manualRestartLibp2pNetworkInternal,
  pollAndBroadcast,
  scheduleLibp2pRestartForReason,
  setBootstrapCompleted,
  setLastObservedRunning,
  setRestartStatus,
  setShutdownRequested,
} from './p2p-network-restart'

export {
  buildP2pNetworkSnapshot,
  getP2pNetworkSnapshot,
} from './p2p-network-snapshot-build'

export { getLibp2pRestartStatus } from './p2p-network-restart'

const POLL_INTERVAL_MS = 3_000

let pollTimer: ReturnType<typeof setInterval> | null = null
let started = false

export function startP2pNetworkManager(): void {
  if (started) return
  started = true
  setShutdownRequested(false)
  setRestartStatus(createInitialLibp2pRestartStatus(Libp2pBridge.isAvailable()))
  ensureLibp2pDependentPubsubResync()

  if (!Libp2pBridge.isAvailable()) {
    recordDiagnosticEvent('libp2p', 'warn', 'toolman-libp2p native module unavailable')
    void pollAndBroadcast()
    pollTimer = setInterval(() => {
      void pollAndBroadcast()
    }, POLL_INTERVAL_MS)
    return
  }

  void bootstrapLibp2pNetwork().then((running) => {
    setBootstrapCompleted(true)
    setLastObservedRunning(running)
    if (!running && !getShutdownRequested()) {
      scheduleLibp2pRestartForReason('initial bootstrap failed')
    }
  })

  pollTimer = setInterval(() => {
    void pollAndBroadcast()
  }, POLL_INTERVAL_MS)
}

export function stopP2pNetworkManager(): void {
  setShutdownRequested(true)
  clearLibp2pRestartTimer()
  setRestartStatus({
    ...getLibp2pRestartStatus(),
    enabled: false,
    attempt: 0,
    nextDelayMs: null,
  })

  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }

  if (Libp2pBridge.isAvailable()) {
    try {
      Libp2pBridge.networkStop()
    } catch (error) {
      const message = toErrorMessage(error, String(error))
      recordDiagnosticEvent('libp2p', 'warn', `network stop failed: ${message}`)
    }
  }

  setLastObservedRunning(false)
  setBootstrapCompleted(false)
  started = false
}

export function isP2pNetworkManagerRunning(): boolean {
  if (!Libp2pBridge.isAvailable()) return false
  try {
    return Libp2pBridge.networkIsRunning()
  } catch {
    return false
  }
}

/** Manual restart from diagnostics UI — resets circuit breaker and restarts swarm. */
export async function manualRestartLibp2pNetwork(): Promise<void> {
  await manualRestartLibp2pNetworkInternal()
}
