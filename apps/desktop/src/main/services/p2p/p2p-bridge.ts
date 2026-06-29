export type {
  NativeDiscoveryConfig,
  NativeDeviceInfo,
  NativeDiscoveredNode,
  NativeConnectionInfo,
  NativeConnectionConnectResult,
  NativeAppendEventInput,
  NativeWalEventRecord,
  NativeIncomingMessage,
  NativeInviteConnectResult,
} from './p2p-bridge-types'

import {
  bridgeConnectionConnect,
  bridgeConnectionDisconnect,
  bridgeConnectionDrainAllMessages,
  bridgeConnectionDrainMessages,
  bridgeConnectionGetStunServers,
  bridgeConnectionList,
  bridgeConnectionRestartIce,
  bridgeConnectionSend,
  bridgeConnectionSetIceServers,
  bridgeConnectionSetStunServers,
  bridgeDeviceIdentityEnsure,
  bridgeDeviceIdentityGetInfo,
  bridgeDiscoveryIsRunning,
  bridgeDiscoveryListNodes,
  bridgeDiscoveryStart,
  bridgeDiscoveryStop,
  bridgePing,
  bridgeVersion,
} from './p2p-bridge-connection'
import {
  bridgeCryptoGenerateWorkspaceKey,
  bridgeCryptoRotateWorkspaceKey,
  bridgeCryptoSetWorkspaceKey,
  bridgeDeviceIdentitySign,
  bridgeDeviceIdentityVerify,
  bridgeEventStoreAppend,
  bridgeEventStoreInit,
  bridgeEventStoreList,
  bridgeInviteConnectAsJoiner,
  bridgeInviteCreateOffer,
  bridgeInviteWaitForAnswer,
  bridgeSnapshotCompress,
  bridgeSnapshotDecompress,
  bridgeSnapshotHash,
  bridgeSnapshotInterval,
} from './p2p-bridge-invite-crypto'
import { isP2pNativeAvailable } from './p2p-bridge-loader'

export class P2pBridge {
  static ping = bridgePing
  static version = bridgeVersion
  static discoveryStart = bridgeDiscoveryStart
  static discoveryStop = bridgeDiscoveryStop
  static discoveryIsRunning = bridgeDiscoveryIsRunning
  static discoveryListNodes = bridgeDiscoveryListNodes
  static deviceIdentityEnsure = bridgeDeviceIdentityEnsure
  static deviceIdentityGetInfo = bridgeDeviceIdentityGetInfo
  static connectionConnect = bridgeConnectionConnect
  static connectionDisconnect = bridgeConnectionDisconnect
  static connectionRestartIce = bridgeConnectionRestartIce
  static connectionList = bridgeConnectionList
  static connectionSend = bridgeConnectionSend
  static connectionSetStunServers = bridgeConnectionSetStunServers
  static connectionSetIceServers = bridgeConnectionSetIceServers
  static connectionGetStunServers = bridgeConnectionGetStunServers
  static inviteCreateOffer = bridgeInviteCreateOffer
  static inviteWaitForAnswer = bridgeInviteWaitForAnswer
  static inviteConnectAsJoiner = bridgeInviteConnectAsJoiner
  static cryptoSetWorkspaceKey = bridgeCryptoSetWorkspaceKey
  static cryptoRotateWorkspaceKey = bridgeCryptoRotateWorkspaceKey
  static cryptoGenerateWorkspaceKey = bridgeCryptoGenerateWorkspaceKey
  static deviceIdentitySign = bridgeDeviceIdentitySign
  static deviceIdentityVerify = bridgeDeviceIdentityVerify
  static eventStoreInit = bridgeEventStoreInit
  static eventStoreAppend = bridgeEventStoreAppend
  static eventStoreList = bridgeEventStoreList
  static connectionDrainAllMessages = bridgeConnectionDrainAllMessages
  static connectionDrainMessages = bridgeConnectionDrainMessages
  static snapshotCompress = bridgeSnapshotCompress
  static snapshotDecompress = bridgeSnapshotDecompress
  static snapshotHash = bridgeSnapshotHash
  static snapshotInterval = bridgeSnapshotInterval
  static isAvailable = isP2pNativeAvailable
}
