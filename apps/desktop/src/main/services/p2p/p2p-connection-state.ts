import type { P2pConnectionInfo, P2pConnectionMode, P2pConnectionState } from '@toolman/shared'
import type { NativeConnectionInfo } from './p2p-bridge'

const KNOWN_STATES = new Set<P2pConnectionState>([
  'idle',
  'signaling',
  'connecting',
  'connected',
  'reconnecting',
  'closed',
])

const KNOWN_MODES = new Set<P2pConnectionMode>(['lan', 'wan'])

export const knownConnections = new Map<string, P2pConnectionInfo>()
export const peerConnectionModes = new Map<string, P2pConnectionMode>()
export const reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>()
export const reconnectAttempts = new Map<string, number>()
export const iceRestartInFlight = new Set<string>()

export function mapNativeConnection(connection: NativeConnectionInfo): P2pConnectionInfo {
  const state = KNOWN_STATES.has(connection.state as P2pConnectionState)
    ? (connection.state as P2pConnectionState)
    : 'idle'
  const connectionMode = KNOWN_MODES.has(connection.connectionMode as P2pConnectionMode)
    ? (connection.connectionMode as P2pConnectionMode)
    : undefined

  if (connectionMode) {
    peerConnectionModes.set(connection.peerDeviceId, connectionMode)
  }

  return {
    peerDeviceId: connection.peerDeviceId,
    state,
    workspaceId: connection.workspaceId,
    connectedAt: connection.connectedAt,
    bytesSent: connection.bytesSent,
    bytesReceived: connection.bytesReceived,
    connectionMode,
  }
}

export function getPeerConnectionMode(peerDeviceId: string): P2pConnectionMode | undefined {
  return peerConnectionModes.get(peerDeviceId)
}

export function getKnownP2pConnections(): P2pConnectionInfo[] {
  return Array.from(knownConnections.values())
}

export function isPeerConnected(peerDeviceId: string): boolean {
  return knownConnections.get(peerDeviceId)?.state === 'connected'
}

export const KNOWN_CONNECTION_STATES = KNOWN_STATES
