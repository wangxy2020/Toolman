import { toErrorMessage, IpcChannel, ipcOk, ipcErr } from '@toolman/shared'
import {
  P2pDiscoveryListNodesInputSchema,
  P2pDiscoveryListNodesOutputSchema,
  P2pDiscoveryStartOutputSchema,
  P2pConnectionConnectInputSchema,
  P2pConnectionConnectOutputSchema,
  P2pConnectionDisconnectInputSchema,
  P2pConnectionDisconnectOutputSchema,
  P2pConnectionListOutputSchema,
  P2pNetworkGetConfigOutputSchema,
  P2pNetworkGetSnapshotOutputSchema,
  P2pNetworkRestartLibp2pOutputSchema,
  P2pNetworkSetStunServersInputSchema,
  P2pNetworkSetStunServersOutputSchema,
  P2pNetworkSetIceServersInputSchema,
  P2pNetworkSetIceServersOutputSchema,
  P2pDeviceGetInfoOutputSchema,
  P2pPingOutputSchema,
} from '@toolman/shared'
import { P2pBridge } from '../../services/p2p/p2p-bridge'
import * as p2pDiscoveryService from '../../services/p2p/p2p-discovery.service'
import * as p2pConnectionService from '../../services/p2p/p2p-connection.service'
import * as p2pDeviceIdentityService from '../../services/p2p/p2p-device-identity.service'
import {
  applyP2pNetworkConfig,
  getP2pIceServers,
  getP2pStunServers,
  getP2pWanNetworkReadiness,
  setP2pIceServers,
  setP2pStunServers,
} from '../../services/p2p/p2p-network.config'
import {
  getP2pNetworkSnapshot,
  manualRestartLibp2pNetwork,
} from '../../services/p2p/p2p-network-manager.service'
import type { P2pIpcHandlerMap } from './types'

export const p2pIpcNetworkHandlers: P2pIpcHandlerMap = {
  [IpcChannel.P2pPing]: async () => {
    try {
      const message = P2pBridge.ping()
      const nativeVersion = P2pBridge.version()
      return ipcOk(
        P2pPingOutputSchema.parse({
          pong: true,
          message,
          nativeVersion,
        }),
      )
    } catch (error) {
      const errMessage = toErrorMessage(error, 'P2P native module unavailable')
      return ipcErr({ code: 'P2P_NATIVE_UNAVAILABLE', message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pDeviceGetInfo]: async () => {
    try {
      const info = p2pDeviceIdentityService.getP2pDeviceInfo()
      return ipcOk(P2pDeviceGetInfoOutputSchema.parse(info))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to get device identity')
      return ipcErr({ code: 'P2P_NATIVE_UNAVAILABLE', message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pDiscoveryStart]: async () => {
    try {
      p2pDiscoveryService.startP2pDiscovery()
      return ipcOk(P2pDiscoveryStartOutputSchema.parse({ started: true }))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to start P2P discovery')
      return ipcErr({ code: 'P2P_NATIVE_UNAVAILABLE', message: errMessage, retryable: true })
    }
  },

  [IpcChannel.P2pDiscoveryStop]: async () => {
    try {
      p2pDiscoveryService.stopP2pDiscovery()
      return ipcOk({})
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to stop P2P discovery')
      return ipcErr({ code: 'P2P_NATIVE_UNAVAILABLE', message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pDiscoveryListNodes]: async (input) => {
    try {
      const parsed = P2pDiscoveryListNodesInputSchema.parse(input ?? {})
      const nodes = p2pDiscoveryService.listP2pDiscoveredNodes(parsed.onlineOnly ?? false)
      return ipcOk(P2pDiscoveryListNodesOutputSchema.parse({ nodes }))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to list discovered nodes')
      return ipcErr({ code: 'P2P_NATIVE_UNAVAILABLE', message: errMessage, retryable: true })
    }
  },

  [IpcChannel.P2pConnectionConnect]: async (input) => {
    try {
      const parsed = P2pConnectionConnectInputSchema.parse(input)
      const state = await p2pConnectionService.connectP2pPeer(
        parsed.peerDeviceId,
        parsed.workspaceId,
      )
      return ipcOk(P2pConnectionConnectOutputSchema.parse({ state }))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to connect peer')
      return ipcErr({ code: 'P2P_CONNECTION_FAILED', message: errMessage, retryable: true })
    }
  },

  [IpcChannel.P2pConnectionDisconnect]: async (input) => {
    try {
      const parsed = P2pConnectionDisconnectInputSchema.parse(input)
      await p2pConnectionService.disconnectP2pPeer(parsed.peerDeviceId)
      return ipcOk(P2pConnectionDisconnectOutputSchema.parse({ state: 'closed' }))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to disconnect peer')
      return ipcErr({ code: 'P2P_CONNECTION_FAILED', message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pConnectionList]: async () => {
    try {
      const connections = await p2pConnectionService.listP2pConnections()
      return ipcOk(P2pConnectionListOutputSchema.parse({ connections }))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to list connections')
      return ipcErr({ code: 'P2P_CONNECTION_FAILED', message: errMessage, retryable: true })
    }
  },

  [IpcChannel.P2pNetworkGetConfig]: async () => {
    try {
      applyP2pNetworkConfig()
      const iceServers = getP2pIceServers()
      return ipcOk(
        P2pNetworkGetConfigOutputSchema.parse({
          stunServers: getP2pStunServers(),
          iceServers,
          wanReadiness: getP2pWanNetworkReadiness(),
        }),
      )
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to read network config')
      return ipcErr({ code: 'INTERNAL_ERROR', message: errMessage, retryable: true })
    }
  },

  [IpcChannel.P2pNetworkSetStunServers]: async (input) => {
    try {
      const parsed = P2pNetworkSetStunServersInputSchema.parse(input)
      setP2pStunServers(parsed.stunServers)
      applyP2pNetworkConfig()
      const iceServers = getP2pIceServers()
      return ipcOk(
        P2pNetworkSetStunServersOutputSchema.parse({
          stunServers: getP2pStunServers(),
          iceServers,
        }),
      )
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to update STUN servers')
      return ipcErr({ code: 'INTERNAL_ERROR', message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pNetworkSetIceServers]: async (input) => {
    try {
      const parsed = P2pNetworkSetIceServersInputSchema.parse(input)
      setP2pIceServers(parsed.iceServers)
      applyP2pNetworkConfig()
      return ipcOk(
        P2pNetworkSetIceServersOutputSchema.parse({
          stunServers: getP2pStunServers(),
          iceServers: getP2pIceServers(),
        }),
      )
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to update ICE servers')
      return ipcErr({ code: 'INTERNAL_ERROR', message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pNetworkGetSnapshot]: async () => {
    try {
      const snapshot = await getP2pNetworkSnapshot()
      return ipcOk(P2pNetworkGetSnapshotOutputSchema.parse(snapshot))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to read network snapshot')
      return ipcErr({ code: 'INTERNAL_ERROR', message: errMessage, retryable: true })
    }
  },

  [IpcChannel.P2pNetworkRestartLibp2p]: async () => {
    try {
      await manualRestartLibp2pNetwork()
      return ipcOk(P2pNetworkRestartLibp2pOutputSchema.parse({ restarted: true }))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to restart libp2p network')
      return ipcErr({ code: 'INTERNAL_ERROR', message: errMessage, retryable: true })
    }
  },
}
