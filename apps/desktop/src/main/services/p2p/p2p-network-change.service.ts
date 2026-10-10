import { net } from 'electron'

import { toErrorMessage } from '@toolman/shared'

import { logStructured } from '../structured-log.service'
import { fireAndForget } from '../../lib/fire-and-forget'
import { applyP2pNetworkConfig } from './p2p-network.config'
import { stopP2pDiscovery, startP2pDiscovery } from './p2p-discovery.service'
import { listP2pConnections, disconnectP2pPeer } from './p2p-connection.service'
import { reconcileOwnerWorkspaceMembers } from './p2p-member-reconcile.service'
import { P2pWorkspaceRepository } from '@toolman/db'
import { getDatabase } from '../../bootstrap/database'

const NETWORK_POLL_MS = 5_000
let pollTimer: ReturnType<typeof setInterval> | null = null
/** Deferred — never call `net.isOnline()` at module load (breaks under some Electron boot paths). */
let lastOnline: boolean | null = null
let recoveryInFlight = false
let recoveryFailed = false
/** Sync Hub (and similar) rebind after the machine comes back online. */
let onNetworkOnline: (() => void) | null = null

export function setP2pNetworkOnlineHandler(handler: (() => void) | null): void {
  onNetworkOnline = handler
}

async function recoverAfterNetworkChange(online: boolean): Promise<void> {
  if (recoveryInFlight) return
  recoveryInFlight = true
  try {
    logStructured('p2p.network_change', 'info', online ? 'network online' : 'network offline', {
      online,
    })
    applyP2pNetworkConfig()

    if (!online) {
      const connections = await listP2pConnections()
      await Promise.all(
        connections.map((item) => disconnectP2pPeer(item.peerDeviceId).catch(() => undefined)),
      )
      stopP2pDiscovery()
      recoveryFailed = false
      return
    }

    stopP2pDiscovery()
    startP2pDiscovery()

    const workspaces = new P2pWorkspaceRepository(getDatabase()).listActive()
    for (const workspace of workspaces) {
      fireAndForget(
        'p2p.network_change.reconcile',
        reconcileOwnerWorkspaceMembers(workspace.id, { immediate: true }),
      )
    }
    recoveryFailed = false
  } catch (error) {
    if (!recoveryFailed) {
      logStructured('p2p.network_change', 'warn', 'network change recovery failed', {
        message: toErrorMessage(error, 'network change recovery failed'),
      })
    }
    recoveryFailed = true
  } finally {
    recoveryInFlight = false
    if (online) {
      try {
        onNetworkOnline?.()
      } catch (error) {
        logStructured('p2p.network_change', 'warn', 'network online handler failed', {
          message: toErrorMessage(error, 'network online handler failed'),
        })
      }
    }
  }
}

function pollNetworkState(): void {
  const online = net.isOnline()
  if (lastOnline !== null && online === lastOnline && !recoveryFailed) return
  lastOnline = online
  fireAndForget('p2p.network_change', recoverAfterNetworkChange(online))
}

export function startP2pNetworkChangeMonitor(): void {
  if (pollTimer) return
  lastOnline = net.isOnline()
  pollTimer = setInterval(pollNetworkState, NETWORK_POLL_MS)
}

export function stopP2pNetworkChangeMonitor(): void {
  if (!pollTimer) return
  clearInterval(pollTimer)
  pollTimer = null
  lastOnline = null
  recoveryFailed = false
}
