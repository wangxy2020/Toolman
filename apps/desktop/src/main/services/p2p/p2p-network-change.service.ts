import { net } from 'electron'

import { toErrorMessage } from '@toolman/shared'

import { logStructured } from '../structured-log.service'
import { applyP2pNetworkConfig } from './p2p-network.config'
import { stopP2pDiscovery, startP2pDiscovery } from './p2p-discovery.service'
import { listP2pConnections, disconnectP2pPeer } from './p2p-connection.service'
import { reconcileOwnerWorkspaceMembers } from './p2p-member-reconcile.service'
import { P2pWorkspaceRepository } from '@toolman/db'
import { getDatabase } from '../../bootstrap/database'

const NETWORK_POLL_MS = 5_000
let pollTimer: ReturnType<typeof setInterval> | null = null
let lastOnline = net.isOnline()
let recoveryInFlight = false

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
      return
    }

    stopP2pDiscovery()
    startP2pDiscovery()

    const workspaces = new P2pWorkspaceRepository(getDatabase()).listActive()
    for (const workspace of workspaces) {
      void reconcileOwnerWorkspaceMembers(workspace.id, { immediate: true })
    }
  } catch (error) {
    logStructured('p2p.network_change', 'warn', 'network change recovery failed', {
      message: toErrorMessage(error, 'network change recovery failed'),
    })
  } finally {
    recoveryInFlight = false
  }
}

function pollNetworkState(): void {
  const online = net.isOnline()
  if (online === lastOnline) return
  lastOnline = online
  void recoverAfterNetworkChange(online)
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
}
