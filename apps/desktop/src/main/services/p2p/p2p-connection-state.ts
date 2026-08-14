import type { P2pConnectionInfo, P2pConnectionMode, P2pConnectionState } from '@toolman/shared'
import { P2pConnectionModeSchema, P2pConnectionStateSchema } from '@toolman/shared'
import type { NativeConnectionInfo } from './p2p-bridge'

export function parseNativeConnectionState(
  state: string,
  fallback: P2pConnectionState = 'idle',
): P2pConnectionState {
  const parsed = P2pConnectionStateSchema.safeParse(state)
  return parsed.success ? parsed.data : fallback
}

export function parseNativeConnectionMode(mode: string | undefined): P2pConnectionMode | undefined {
  if (!mode) return undefined
  const parsed = P2pConnectionModeSchema.safeParse(mode)
  return parsed.success ? parsed.data : undefined
}

export const knownConnections = new Map<string, P2pConnectionInfo>()
export const peerConnectionModes = new Map<string, P2pConnectionMode>()
export const reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>()
export const reconnectAttempts = new Map<string, number>()
export const iceRestartInFlight = new Set<string>()

export function mapNativeConnection(connection: NativeConnectionInfo): P2pConnectionInfo {
  const state = parseNativeConnectionState(connection.state)
  const connectionMode = parseNativeConnectionMode(connection.connectionMode)

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
