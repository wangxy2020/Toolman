import { app } from 'electron'
import { toErrorMessage } from '@toolman/shared'
import { recordDiagnosticEvent } from '../diagnostics-log'
import { P2pBridge } from './p2p-bridge'
import { ensureP2pDeviceIdentity } from './p2p-device-identity.service'
import { Libp2pBridge } from './libp2p-bridge'
import { broadcastP2pNetworkSnapshotUpdated } from './p2p-network-broadcast'
import { ensureDefaultLibp2pConfig } from './p2p-libp2p.config'
import {
  createInitialLibp2pRestartStatus,
  LIBP2P_MAX_RESTART_ATTEMPTS,
  nextLibp2pRestartDelayMs,
  notifyLibp2pRestartListeners,
  type Libp2pRestartStatus,
} from './p2p-libp2p-restart'
import { buildP2pNetworkSnapshot, setLastNetworkError } from './p2p-network-snapshot-build'

let restartTimer: ReturnType<typeof setTimeout> | null = null
let shutdownRequested = false
let restartInFlight = false
let bootstrapCompleted = false
let lastObservedRunning = false
let restartStatus = createInitialLibp2pRestartStatus(false)

export function getLibp2pRestartStatus(): Libp2pRestartStatus {
  return { ...restartStatus }
}

export function getBootstrapCompleted(): boolean {
  return bootstrapCompleted
}

export function setBootstrapCompleted(value: boolean): void {
  bootstrapCompleted = value
}

export function getShutdownRequested(): boolean {
  return shutdownRequested
}

export function setShutdownRequested(value: boolean): void {
  shutdownRequested = value
}

export function getLastObservedRunning(): boolean {
  return lastObservedRunning
}

export function setLastObservedRunning(value: boolean): void {
  lastObservedRunning = value
}

export function getRestartStatus(): Libp2pRestartStatus {
  return restartStatus
}

export function setRestartStatus(value: Libp2pRestartStatus): void {
  restartStatus = value
}

function clearRestartTimer(): void {
  if (restartTimer) {
    clearTimeout(restartTimer)
    restartTimer = null
  }
  restartStatus = {
    ...restartStatus,
    nextDelayMs: null,
  }
}

function scheduleLibp2pRestart(reason: string): void {
  if (shutdownRequested || restartTimer || restartInFlight || !restartStatus.enabled) {
    return
  }

  if (restartStatus.tripped || restartStatus.attempt >= LIBP2P_MAX_RESTART_ATTEMPTS) {
    restartStatus = {
      ...restartStatus,
      tripped: true,
      lastReason: reason,
    }
    recordDiagnosticEvent(
      'libp2p',
      'error',
      `swarm restart circuit breaker tripped after ${restartStatus.attempt} attempts: ${reason}`,
    )
    return
  }

  const attempt = restartStatus.attempt + 1
  const delayMs = nextLibp2pRestartDelayMs(attempt)
  restartStatus = {
    ...restartStatus,
    attempt,
    nextDelayMs: delayMs,
    lastReason: reason,
  }

  recordDiagnosticEvent(
    'libp2p',
    'warn',
    `scheduling swarm restart in ${delayMs}ms (attempt ${attempt}): ${reason}`,
  )

  restartTimer = setTimeout(() => {
    restartTimer = null
    restartStatus = {
      ...restartStatus,
      nextDelayMs: null,
    }
    void restartLibp2pNetwork(reason)
  }, delayMs)
}

export async function restartLibp2pNetwork(reason: string): Promise<void> {
  if (shutdownRequested || restartInFlight || !Libp2pBridge.isAvailable()) {
    return
  }

  restartInFlight = true
  try {
    try {
      Libp2pBridge.networkStop()
    } catch {
      // Swarm may already be stopped after an abnormal exit.
    }

    const startedOk = await bootstrapLibp2pNetwork()
    if (startedOk) {
      restartStatus = {
        ...restartStatus,
        attempt: 0,
        lastRestartAt: Date.now(),
        lastReason: reason,
        nextDelayMs: null,
      }
      await notifyLibp2pRestartListeners()
      recordDiagnosticEvent('libp2p', 'info', `swarm restart succeeded: ${reason}`)
      return
    }

    scheduleLibp2pRestart(`restart failed: ${reason}`)
  } finally {
    restartInFlight = false
  }
}

export function observeLibp2pHealth(running: boolean): void {
  if (!restartStatus.enabled || shutdownRequested || !bootstrapCompleted) {
    lastObservedRunning = running
    return
  }

  if (lastObservedRunning && !running) {
    scheduleLibp2pRestart('swarm stopped unexpectedly')
  }

  lastObservedRunning = running
}

export async function pollAndBroadcast(): Promise<void> {
  const snapshot = await buildP2pNetworkSnapshot()
  if (Libp2pBridge.isAvailable()) {
    observeLibp2pHealth(snapshot.libp2pRunning)
  }
  broadcastP2pNetworkSnapshotUpdated(snapshot)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function waitForLibp2pRunning(timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (Libp2pBridge.networkIsRunning()) {
      return true
    }
    await sleep(100)
  }
  return Libp2pBridge.networkIsRunning()
}

export async function bootstrapLibp2pNetwork(): Promise<boolean> {
  try {
    ensureP2pDeviceIdentity()
    if (P2pBridge.isAvailable()) {
      P2pBridge.ping()
    }
    const config = ensureDefaultLibp2pConfig()
    Libp2pBridge.networkStart(app.getPath('userData'), JSON.stringify(config))
    await waitForLibp2pRunning(5_000)
    const peerId = Libp2pBridge.networkLocalPeerId()
    const running = Libp2pBridge.networkIsRunning()
    if (!running) {
      const snapshot = Libp2pBridge.networkGetSnapshot()
      const message = snapshot.error ?? 'libp2p swarm failed to start'
      setLastNetworkError(message)
      recordDiagnosticEvent('libp2p', 'error', message)
      return false
    }

    setLastNetworkError(null)
    recordDiagnosticEvent(
      'libp2p',
      'info',
      `network started (peer=${peerId ?? 'unknown'})`,
    )
    return true
  } catch (error) {
    const message = toErrorMessage(error, String(error))
    setLastNetworkError(message)
    recordDiagnosticEvent('libp2p', 'error', message)
    return false
  } finally {
    void pollAndBroadcast()
  }
}

export function clearLibp2pRestartTimer(): void {
  clearRestartTimer()
}

export function scheduleLibp2pRestartForReason(reason: string): void {
  scheduleLibp2pRestart(reason)
}

export async function manualRestartLibp2pNetworkInternal(): Promise<void> {
  if (!Libp2pBridge.isAvailable()) {
    throw new Error('libp2p 原生模块不可用')
  }
  clearRestartTimer()
  restartStatus = {
    ...createInitialLibp2pRestartStatus(true),
    enabled: true,
  }
  shutdownRequested = false
  bootstrapCompleted = true
  await restartLibp2pNetwork('manual restart from diagnostics')
}
