import { toErrorMessage, IpcChannel, ipcOk, ipcErr, type IpcResult } from '@toolman/shared'
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
  P2pWorkspaceCreateInputSchema,
  P2pWorkspaceCreateOutputSchema,
  P2pWorkspaceDeleteInputSchema,
  P2pWorkspaceDeleteOutputSchema,
  P2pWorkspaceGetInputSchema,
  P2pWorkspaceGetOutputSchema,
  P2pWorkspaceLeaveInputSchema,
  P2pWorkspaceLeaveOutputSchema,
  P2pWorkspaceGetStoragePathInputSchema,
  P2pWorkspaceGetStoragePathOutputSchema,
  P2pWorkspaceListInputSchema,
  P2pWorkspaceListOutputSchema,
  P2pWorkspaceUpdateInputSchema,
  P2pWorkspaceUpdateOutputSchema,
  P2pMemberListInputSchema,
  P2pMemberListOutputSchema,
  P2pMemberInviteInputSchema,
  P2pMemberInviteOutputSchema,
  P2pMemberJoinInputSchema,
  P2pMemberJoinOutputSchema,
  P2pMemberRemoveInputSchema,
  P2pMemberRemoveOutputSchema,
  P2pMemberUpdateRoleInputSchema,
  P2pMemberUpdateRoleOutputSchema,
  P2pMemberTrustDeviceInputSchema,
  P2pMemberTrustDeviceOutputSchema,
  P2pMemberListPendingTrustPromptsOutputSchema,
  P2pEventListInputSchema,
  P2pEventListOutputSchema,
  P2pEventGetInputSchema,
  P2pEventGetOutputSchema,
  P2pSyncWorkspaceInputSchema,
  P2pSyncStartOutputSchema,
  P2pSyncStopOutputSchema,
  P2pSyncStatusOutputSchema,
  P2pSyncForceInputSchema,
  P2pSyncForceOutputSchema,
  P2pSyncCatchUpInputSchema,
  P2pSyncCatchUpOutputSchema,
  P2pKnowledgeRemoveDocumentsInputSchema,
  P2pKnowledgeRemoveDocumentsOutputSchema,
  P2pKnowledgeSetDocumentPermissionInputSchema,
  P2pKnowledgeSetDocumentPermissionOutputSchema,
  P2pKnowledgeEnsureDocumentSavedInputSchema,
  P2pKnowledgeEnsureDocumentSavedOutputSchema,
  P2pKnowledgeMaterializeDocumentInputSchema,
  P2pKnowledgeMaterializeDocumentOutputSchema,
  P2pKnowledgeShareInputSchema,
  P2pKnowledgeShareOutputSchema,
  P2pKnowledgeSyncDocumentInputSchema,
  P2pKnowledgeSyncDocumentOutputSchema,
  P2pResourceListInputSchema,
  P2pResourceListOutputSchema,
  P2pResourceUnshareInputSchema,
  P2pResourceUnshareOutputSchema,
  P2pNoteShareInputSchema,
  P2pNoteShareOutputSchema,
  P2pNotePushUpdateInputSchema,
  P2pNotePushUpdateOutputSchema,
  P2pNoteSetPermissionInputSchema,
  P2pNoteSetPermissionOutputSchema,
  P2pNoteListShareTargetsInputSchema,
  P2pNoteListShareTargetsOutputSchema,
  P2pAgentExportPackageInputSchema,
  P2pAgentExportPackageOutputSchema,
  P2pAgentImportPackageInputSchema,
  P2pAgentImportPackageOutputSchema,
  P2pAgentShareInputSchema,
  P2pAgentShareOutputSchema,
  P2pAgentRemoveSessionsInputSchema,
  P2pAgentRemoveSessionsOutputSchema,
  P2pAgentSetSessionPermissionInputSchema,
  P2pAgentSetSessionPermissionOutputSchema,
  P2pAgentOpenSessionInputSchema,
  P2pAgentOpenSessionOutputSchema,
  P2pGroupChatListInputSchema,
  P2pGroupChatListOutputSchema,
  P2pGroupChatSendInputSchema,
  P2pGroupChatSendOutputSchema,
  P2pGroupChatDeleteInputSchema,
  P2pGroupChatDeleteOutputSchema,
  P2pGroupChatClearInputSchema,
  P2pGroupChatClearOutputSchema,
  P2pWorkflowShareInputSchema,
  P2pWorkflowShareOutputSchema,
  P2pWorkflowListLocalOutputSchema,
} from '@toolman/shared'
import { P2pSharedResourceRepository } from '@toolman/db'
import { getDatabase } from '../bootstrap/database'
import { P2pBridge } from '../services/p2p/p2p-bridge'
import * as p2pDiscoveryService from '../services/p2p/p2p-discovery.service'
import * as p2pConnectionService from '../services/p2p/p2p-connection.service'
import * as p2pDeviceIdentityService from '../services/p2p/p2p-device-identity.service'
import * as p2pWorkspaceService from '../services/p2p/p2p-workspace.service'
import * as p2pInviteService from '../services/p2p/p2p-invite.service'
import * as p2pMemberService from '../services/p2p/p2p-member.service'
import { P2pMemberLimitError } from '../services/p2p/p2p-member-join.service'
import * as p2pPeerService from '../services/p2p/p2p-peer.service'
import * as p2pEventService from '../services/p2p/p2p-event.service'
import * as p2pSyncService from '../services/p2p/p2p-sync.service'
import * as p2pKnowledgeSyncService from '../services/p2p/knowledge-sync.service'
import * as p2pNoteSyncService from '../services/p2p/note-sync.service'
import * as p2pAgentShareService from '../services/p2p/agent-share.service'
import * as p2pGroupAgentProxyService from '../services/p2p/p2p-group-agent-proxy.service'
import * as p2pGroupChatService from '../services/p2p/p2p-group-chat.service'
import * as p2pWorkflowSyncService from '../services/p2p/workflow-sync-share.service'
import { listP2pSharedResourcesForWorkspace } from '../services/p2p/p2p-shared-resource-list.service'
import {
  applyP2pNetworkConfig,
  getP2pIceServers,
  getP2pStunServers,
  getP2pWanNetworkReadiness,
  setP2pIceServers,
  setP2pStunServers,
} from '../services/p2p/p2p-network.config'
import {
  getP2pNetworkSnapshot,
  manualRestartLibp2pNetwork,
} from '../services/p2p/p2p-network-manager.service'

type HandlerFn = (input: unknown) => Promise<IpcResult<unknown>>

export const p2pIpcHandlers: Partial<Record<IpcChannel, HandlerFn>> = {
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

  [IpcChannel.P2pWorkspaceCreate]: async (input) => {
    try {
      const parsed = P2pWorkspaceCreateInputSchema.parse(input)
      const result = await p2pWorkspaceService.createP2pWorkspace(parsed)
      return ipcOk(P2pWorkspaceCreateOutputSchema.parse(result))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to create workspace')
      return ipcErr({ code: 'INTERNAL_ERROR', message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pWorkspaceList]: async (input) => {
    try {
      const parsed = P2pWorkspaceListInputSchema.parse(input ?? {})
      const filter = parsed.filter ?? 'all'
      if (filter === 'mine' || filter === 'all') {
        await p2pWorkspaceService.ensureDefaultOwnedP2pWorkspace()
      }
      const workspaces = p2pWorkspaceService.listP2pWorkspaces(filter)
      return ipcOk(
        P2pWorkspaceListOutputSchema.parse({
          workspaces,
          pendingJoinIds: p2pWorkspaceService.listPendingP2pJoinRequestIds(),
        }),
      )
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to list workspaces')
      return ipcErr({ code: 'INTERNAL_ERROR', message: errMessage, retryable: true })
    }
  },

  [IpcChannel.P2pWorkspaceGet]: async (input) => {
    try {
      const parsed = P2pWorkspaceGetInputSchema.parse(input)
      const workspace = p2pWorkspaceService.getP2pWorkspace(parsed.id)
      return ipcOk(P2pWorkspaceGetOutputSchema.parse({ workspace }))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to get workspace')
      const code = errMessage.includes('不存在') ? 'P2P_NOT_FOUND' : 'P2P_FORBIDDEN'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pWorkspaceUpdate]: async (input) => {
    try {
      const parsed = P2pWorkspaceUpdateInputSchema.parse(input)
      const workspace = p2pWorkspaceService.updateP2pWorkspace(parsed)
      return ipcOk(P2pWorkspaceUpdateOutputSchema.parse({ workspace }))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to update workspace')
      const code = errMessage.includes('群主') ? 'P2P_FORBIDDEN' : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pWorkspaceDelete]: async (input) => {
    try {
      const parsed = P2pWorkspaceDeleteInputSchema.parse(input)
      await p2pWorkspaceService.deleteP2pWorkspace(parsed.id)
      return ipcOk(P2pWorkspaceDeleteOutputSchema.parse({ deleted: true }))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to delete workspace')
      const code = errMessage.includes('群主') ? 'P2P_FORBIDDEN' : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pWorkspaceLeave]: async (input) => {
    try {
      const parsed = P2pWorkspaceLeaveInputSchema.parse(input)
      await p2pWorkspaceService.leaveP2pWorkspace(parsed.id)
      return ipcOk(P2pWorkspaceLeaveOutputSchema.parse({ left: true }))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to leave workspace')
      return ipcErr({ code: 'INTERNAL_ERROR', message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pWorkspaceGetStoragePath]: async (input) => {
    try {
      const parsed = P2pWorkspaceGetStoragePathInputSchema.parse(input)
      const storagePath = p2pWorkspaceService.getP2pWorkspaceStoragePath(parsed.id)
      return ipcOk(P2pWorkspaceGetStoragePathOutputSchema.parse({ storagePath }))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to get workspace storage path')
      const code = errMessage.includes('无权') ? 'P2P_FORBIDDEN' : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pMemberList]: async (input) => {
    try {
      const parsed = P2pMemberListInputSchema.parse(input)
      const members = await p2pMemberService.prepareP2pMemberList(parsed.workspaceId)
      return ipcOk(P2pMemberListOutputSchema.parse({ members }))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to list members')
      const code = errMessage.includes('无权') ? 'P2P_FORBIDDEN' : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pMemberInvite]: async (input) => {
    try {
      const parsed = P2pMemberInviteInputSchema.parse(input)
      const result = await p2pInviteService.createP2pInvite(parsed)
      return ipcOk(P2pMemberInviteOutputSchema.parse(result))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to create invite')
      const code = errMessage.includes('无权') ? 'P2P_FORBIDDEN' : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pMemberJoin]: async (input) => {
    try {
      const parsed = P2pMemberJoinInputSchema.parse(input)
      const result = await p2pMemberService.joinP2pWorkspace(parsed)
      return ipcOk(P2pMemberJoinOutputSchema.parse(result))
    } catch (error) {
      if (error instanceof P2pMemberLimitError) {
        return ipcErr({ code: 'P2P_MEMBER_LIMIT', message: error.message, retryable: false })
      }
      if (error instanceof p2pMemberService.P2pMemberVipRequiredError) {
        return ipcErr({ code: 'P2P_MEMBER_VIP_REQUIRED', message: error.message, retryable: false })
      }
      const errMessage = toErrorMessage(error, 'Failed to join workspace')
      let code: 'P2P_INVITE_EXPIRED' | 'P2P_FORBIDDEN' | 'P2P_MEMBER_LIMIT' | 'INTERNAL_ERROR' =
        'INTERNAL_ERROR'
      if (errMessage.includes('过期')) code = 'P2P_INVITE_EXPIRED'
      else if (errMessage.includes('上限')) code = 'P2P_MEMBER_LIMIT'
      else if (errMessage.includes('签名') || errMessage.includes('已是')) code = 'P2P_FORBIDDEN'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pMemberRemove]: async (input) => {
    try {
      const parsed = P2pMemberRemoveInputSchema.parse(input)
      await p2pMemberService.removeP2pMember(parsed)
      return ipcOk(P2pMemberRemoveOutputSchema.parse({ removed: true }))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to remove member')
      const code = errMessage.includes('无权') ? 'P2P_FORBIDDEN' : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pMemberUpdateRole]: async (input) => {
    try {
      const parsed = P2pMemberUpdateRoleInputSchema.parse(input)
      const member = p2pMemberService.updateP2pMemberRole(parsed)
      return ipcOk(P2pMemberUpdateRoleOutputSchema.parse({ member }))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to update member role')
      const code = errMessage.includes('群主') ? 'P2P_FORBIDDEN' : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pMemberTrustDevice]: async (input) => {
    try {
      const parsed = P2pMemberTrustDeviceInputSchema.parse(input)
      const result = p2pPeerService.trustP2pPeerDevice(parsed)
      return ipcOk(P2pMemberTrustDeviceOutputSchema.parse(result))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to trust device')
      const code = errMessage.includes('信任') ? 'P2P_TRUST_REQUIRED' : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pMemberListPendingTrustPrompts]: async () => {
    try {
      return ipcOk(
        P2pMemberListPendingTrustPromptsOutputSchema.parse({
          prompts: p2pPeerService.listPendingTrustPrompts(),
        }),
      )
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to list pending trust prompts')
      return ipcErr({ code: 'INTERNAL_ERROR', message: errMessage, retryable: true })
    }
  },

  [IpcChannel.P2pEventList]: async (input) => {
    try {
      const parsed = P2pEventListInputSchema.parse(input)
      const result = p2pEventService.listP2pEvents(parsed)
      return ipcOk(P2pEventListOutputSchema.parse(result))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to list events')
      const code = errMessage.includes('无权') ? 'P2P_FORBIDDEN' : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pEventGet]: async (input) => {
    try {
      const parsed = P2pEventGetInputSchema.parse(input)
      const event = p2pEventService.getP2pEvent(parsed.eventId)
      return ipcOk(P2pEventGetOutputSchema.parse({ event }))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to get event')
      const code = errMessage.includes('不存在')
        ? 'NOT_FOUND'
        : errMessage.includes('无权')
          ? 'P2P_FORBIDDEN'
          : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pSyncStart]: async (input) => {
    try {
      const parsed = P2pSyncWorkspaceInputSchema.parse(input)
      const result = await p2pSyncService.startP2pSync(parsed.workspaceId)
      return ipcOk(P2pSyncStartOutputSchema.parse(result))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to start sync')
      return ipcErr({ code: 'INTERNAL_ERROR', message: errMessage, retryable: true })
    }
  },

  [IpcChannel.P2pSyncStop]: async (input) => {
    try {
      const parsed = P2pSyncWorkspaceInputSchema.parse(input)
      const result = p2pSyncService.stopP2pSync(parsed.workspaceId)
      return ipcOk(P2pSyncStopOutputSchema.parse(result))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to stop sync')
      return ipcErr({ code: 'INTERNAL_ERROR', message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pSyncStatus]: async (input) => {
    try {
      const parsed = P2pSyncWorkspaceInputSchema.parse(input)
      const result = p2pSyncService.getP2pSyncStatus(parsed.workspaceId)
      return ipcOk(P2pSyncStatusOutputSchema.parse(result))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to get sync status')
      const code = errMessage.includes('无权') ? 'P2P_FORBIDDEN' : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pSyncForce]: async (input) => {
    try {
      const parsed = P2pSyncForceInputSchema.parse(input)
      const result = await p2pSyncService.forceP2pSync(
        parsed.workspaceId,
        parsed.peerDeviceId,
      )
      return ipcOk(P2pSyncForceOutputSchema.parse(result))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to force sync')
      return ipcErr({ code: 'INTERNAL_ERROR', message: errMessage, retryable: true })
    }
  },

  [IpcChannel.P2pSyncCatchUp]: async (input) => {
    try {
      const parsed = P2pSyncCatchUpInputSchema.parse(input)
      await p2pSyncService.awaitJoinerEventCatchUp(parsed.workspaceId, {
        force: parsed.force,
      })
      return ipcOk(P2pSyncCatchUpOutputSchema.parse({ caughtUp: true }))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to catch up events')
      return ipcErr({ code: 'INTERNAL_ERROR', message: errMessage, retryable: true })
    }
  },

  [IpcChannel.P2pKnowledgeShare]: async (input) => {
    try {
      const parsed = P2pKnowledgeShareInputSchema.parse(input)
      const result = await p2pKnowledgeSyncService.shareP2pKnowledge(parsed)
      return ipcOk(P2pKnowledgeShareOutputSchema.parse(result))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to share knowledge base')
      const code = errMessage.includes('无权') || errMessage.includes('只读')
        ? 'P2P_FORBIDDEN'
        : errMessage.includes('不存在')
          ? 'NOT_FOUND'
          : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pKnowledgeSyncDocument]: async (input) => {
    try {
      const parsed = P2pKnowledgeSyncDocumentInputSchema.parse(input)
      const result = await p2pKnowledgeSyncService.syncP2pKnowledgeDocument(parsed)
      return ipcOk(P2pKnowledgeSyncDocumentOutputSchema.parse(result))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to sync knowledge document')
      const code = errMessage.includes('无权')
        ? 'P2P_FORBIDDEN'
        : errMessage.includes('不存在') || errMessage.includes('未就绪') || errMessage.includes('尚未共享')
          ? 'NOT_FOUND'
          : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: true })
    }
  },

  [IpcChannel.P2pKnowledgeRemoveDocuments]: async (input) => {
    try {
      const parsed = P2pKnowledgeRemoveDocumentsInputSchema.parse(input)
      const result = await p2pKnowledgeSyncService.removeP2pKnowledgeDocuments(parsed)
      return ipcOk(P2pKnowledgeRemoveDocumentsOutputSchema.parse(result))
    } catch (error) {
      const errMessage =
        toErrorMessage(error, 'Failed to remove shared knowledge documents')
      const code = errMessage.includes('无权') || errMessage.includes('只读')
        ? 'P2P_FORBIDDEN'
        : errMessage.includes('不存在') || errMessage.includes('未能移除')
          ? 'NOT_FOUND'
          : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pKnowledgeSetDocumentPermission]: async (input) => {
    try {
      const parsed = P2pKnowledgeSetDocumentPermissionInputSchema.parse(input)
      const result = await p2pKnowledgeSyncService.setP2pKnowledgeDocumentPermission(parsed)
      return ipcOk(P2pKnowledgeSetDocumentPermissionOutputSchema.parse(result))
    } catch (error) {
      const errMessage =
        toErrorMessage(error, 'Failed to set knowledge document permission')
      const code = errMessage.includes('无权') || errMessage.includes('只读')
        ? 'P2P_FORBIDDEN'
        : errMessage.includes('不存在') || errMessage.includes('未共享')
          ? 'NOT_FOUND'
          : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pKnowledgeEnsureDocumentSaved]: async (input) => {
    try {
      const parsed = P2pKnowledgeEnsureDocumentSavedInputSchema.parse(input)
      const result = await p2pKnowledgeSyncService.ensureP2pKnowledgeDocumentSaved(parsed)
      return ipcOk(P2pKnowledgeEnsureDocumentSavedOutputSchema.parse(result))
    } catch (error) {
      const errMessage =
        toErrorMessage(error, 'Failed to save shared knowledge document')
      const code = errMessage.includes('无权') || errMessage.includes('未开放')
        ? 'P2P_FORBIDDEN'
        : errMessage.includes('不存在') || errMessage.includes('未就绪') || errMessage.includes('尚未同步')
          ? 'NOT_FOUND'
          : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: true })
    }
  },

  [IpcChannel.P2pKnowledgeMaterializeDocument]: async (input) => {
    try {
      const parsed = P2pKnowledgeMaterializeDocumentInputSchema.parse(input)
      const result = await p2pKnowledgeSyncService.materializeP2pKnowledgeDocumentForOpen(parsed)
      return ipcOk(P2pKnowledgeMaterializeDocumentOutputSchema.parse(result))
    } catch (error) {
      const errMessage =
        toErrorMessage(error, 'Failed to materialize shared knowledge document')
      const code =
        errMessage.includes('不存在') || errMessage.includes('未就绪') || errMessage.includes('尚未同步')
          ? 'NOT_FOUND'
          : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: true })
    }
  },

  [IpcChannel.P2pAgentExportPackage]: async (input) => {
    try {
      const parsed = P2pAgentExportPackageInputSchema.parse(input)
      const result = p2pAgentShareService.exportP2pAgentPackage(parsed)
      return ipcOk(P2pAgentExportPackageOutputSchema.parse(result))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to export agent package')
      const code = errMessage.includes('不存在')
        ? 'NOT_FOUND'
        : errMessage.includes('内置')
          ? 'P2P_FORBIDDEN'
          : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pAgentImportPackage]: async (input) => {
    try {
      const parsed = P2pAgentImportPackageInputSchema.parse(input)
      const result = p2pAgentShareService.importP2pAgentPackage(parsed)
      return ipcOk(P2pAgentImportPackageOutputSchema.parse(result))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to import agent package')
      const code = errMessage.includes('不存在') ? 'NOT_FOUND' : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pAgentShare]: async (input) => {
    try {
      const parsed = P2pAgentShareInputSchema.parse(input)
      const result = await p2pAgentShareService.shareP2pAgent(parsed)
      return ipcOk(P2pAgentShareOutputSchema.parse(result))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to share agent')
      const code = errMessage.includes('无权') || errMessage.includes('只读')
        ? 'P2P_FORBIDDEN'
        : errMessage.includes('不存在') || errMessage.includes('未就绪')
          ? 'NOT_FOUND'
          : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pAgentRemoveSessions]: async (input) => {
    try {
      const parsed = P2pAgentRemoveSessionsInputSchema.parse(input)
      const result = await p2pAgentShareService.removeP2pAgentSessions(parsed)
      return ipcOk(P2pAgentRemoveSessionsOutputSchema.parse(result))
    } catch (error) {
      const errMessage =
        toErrorMessage(error, 'Failed to remove shared agent sessions')
      const code = errMessage.includes('无权') || errMessage.includes('只读')
        ? 'P2P_FORBIDDEN'
        : errMessage.includes('不存在') || errMessage.includes('未能移除')
          ? 'NOT_FOUND'
          : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pAgentSetSessionPermission]: async (input) => {
    try {
      const parsed = P2pAgentSetSessionPermissionInputSchema.parse(input)
      const result = await p2pAgentShareService.setP2pAgentSessionPermission(parsed)
      return ipcOk(P2pAgentSetSessionPermissionOutputSchema.parse(result))
    } catch (error) {
      const errMessage =
        toErrorMessage(error, 'Failed to set agent session permission')
      const code = errMessage.includes('无权') || errMessage.includes('只读')
        ? 'P2P_FORBIDDEN'
        : errMessage.includes('不存在') || errMessage.includes('未共享')
          ? 'NOT_FOUND'
          : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pAgentOpenSession]: async (input) => {
    try {
      const parsed = P2pAgentOpenSessionInputSchema.parse(input)
      const result = await p2pGroupAgentProxyService.openP2pGroupAgentSession(parsed)
      return ipcOk(P2pAgentOpenSessionOutputSchema.parse(result))
    } catch (error) {
      const errMessage =
        toErrorMessage(error, 'Failed to open group agent session')
      const code = errMessage.includes('无权') || errMessage.includes('只读')
        ? 'P2P_FORBIDDEN'
        : errMessage.includes('不存在') || errMessage.includes('未就绪')
          ? 'NOT_FOUND'
          : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pGroupChatList]: async (input) => {
    try {
      const parsed = P2pGroupChatListInputSchema.parse(input)
      const result = p2pGroupChatService.listP2pGroupChatMessages(parsed)
      return ipcOk(P2pGroupChatListOutputSchema.parse(result))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to list group chat messages')
      const code = errMessage.includes('无权') ? 'P2P_FORBIDDEN' : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pGroupChatSend]: async (input) => {
    try {
      const parsed = P2pGroupChatSendInputSchema.parse(input)
      const result = await p2pGroupChatService.sendP2pGroupChatMessage(parsed)
      return ipcOk(P2pGroupChatSendOutputSchema.parse(result))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to send group chat message')
      const code = errMessage.includes('无权') || errMessage.includes('只读')
        ? 'P2P_FORBIDDEN'
        : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pGroupChatDelete]: async (input) => {
    try {
      const parsed = P2pGroupChatDeleteInputSchema.parse(input)
      const result = p2pGroupChatService.deleteP2pGroupChatMessage(parsed)
      return ipcOk(P2pGroupChatDeleteOutputSchema.parse(result))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to delete group chat message')
      const code = errMessage.includes('无权') ? 'P2P_FORBIDDEN' : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pGroupChatClear]: async (input) => {
    try {
      const parsed = P2pGroupChatClearInputSchema.parse(input)
      const result = p2pGroupChatService.clearP2pGroupChatMessages(parsed)
      return ipcOk(P2pGroupChatClearOutputSchema.parse(result))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to clear group chat messages')
      const code = errMessage.includes('无权') || errMessage.includes('只读') || errMessage.includes('群主')
        ? 'P2P_FORBIDDEN'
        : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pNoteShare]: async (input) => {
    try {
      const parsed = P2pNoteShareInputSchema.parse(input)
      const result = await p2pNoteSyncService.shareP2pNote(parsed)
      return ipcOk(
        P2pNoteShareOutputSchema.parse({ sharedResource: result.sharedResource }),
      )
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to share note')
      const code = errMessage.includes('无权') || errMessage.includes('只读')
        ? 'P2P_FORBIDDEN'
        : errMessage.includes('不存在')
          ? 'NOT_FOUND'
          : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pNotePushUpdate]: async (input) => {
    try {
      const parsed = P2pNotePushUpdateInputSchema.parse(input)
      const result = await p2pNoteSyncService.pushP2pNoteUpdate(parsed)
      return ipcOk(P2pNotePushUpdateOutputSchema.parse(result))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to push note update')
      const code = errMessage.includes('无权') || errMessage.includes('只读')
        ? 'P2P_FORBIDDEN'
        : errMessage.includes('不存在') || errMessage.includes('尚未共享')
          ? 'NOT_FOUND'
          : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: true })
    }
  },

  [IpcChannel.P2pNoteListShareTargets]: async (input) => {
    try {
      const parsed = P2pNoteListShareTargetsInputSchema.parse(input)
      const result = p2pNoteSyncService.listP2pNoteShareTargets(parsed.noteId)
      return ipcOk(P2pNoteListShareTargetsOutputSchema.parse(result))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to list note share targets')
      return ipcErr({ code: 'INTERNAL_ERROR', message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pNoteSetPermission]: async (input) => {
    try {
      const parsed = P2pNoteSetPermissionInputSchema.parse(input)
      const result = await p2pNoteSyncService.setP2pNotePermission(parsed)
      return ipcOk(
        P2pNoteSetPermissionOutputSchema.parse({ sharedResource: result.sharedResource }),
      )
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to set note permission')
      const code = errMessage.includes('无权') || errMessage.includes('只读')
        ? 'P2P_FORBIDDEN'
        : errMessage.includes('不存在')
          ? 'NOT_FOUND'
          : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pResourceUnshare]: async (input) => {
    try {
      const parsed = P2pResourceUnshareInputSchema.parse(input)
      const resource = new P2pSharedResourceRepository(getDatabase()).findById(parsed.resourceId)
      if (!resource || resource.workspaceId !== parsed.workspaceId) {
        return ipcErr({ code: 'NOT_FOUND', message: '共享资源不存在', retryable: false })
      }
      if (resource.resourceType === 'File') {
        return ipcErr({
          code: 'NOT_FOUND',
          message: '群组独立文件共享已移除',
          retryable: false,
        })
      }
      const result =
        resource.resourceType === 'Note'
          ? await p2pNoteSyncService.unshareP2pNote(parsed)
          : resource.resourceType === 'Agent'
            ? await p2pAgentShareService.unshareP2pAgent(parsed)
            : resource.resourceType === 'Workflow'
              ? await p2pWorkflowSyncService.unshareP2pWorkflow(parsed)
              : await p2pKnowledgeSyncService.unshareP2pKnowledge(parsed)
      return ipcOk(P2pResourceUnshareOutputSchema.parse(result))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to unshare resource')
      const code = errMessage.includes('无权') || errMessage.includes('只读') || errMessage.includes('群主')
        ? 'P2P_FORBIDDEN'
        : errMessage.includes('不存在')
          ? 'NOT_FOUND'
          : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pResourceList]: async (input) => {
    try {
      const parsed = P2pResourceListInputSchema.parse(input)
      const result = listP2pSharedResourcesForWorkspace(parsed)
      return ipcOk(P2pResourceListOutputSchema.parse(result))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to list shared resources')
      const code = errMessage.includes('无权') ? 'P2P_FORBIDDEN' : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pWorkflowShare]: async (input) => {
    try {
      const parsed = P2pWorkflowShareInputSchema.parse(input)
      const result = await p2pWorkflowSyncService.shareP2pWorkflow(parsed)
      return ipcOk(P2pWorkflowShareOutputSchema.parse(result))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to share workflow')
      const code = errMessage.includes('无权') || errMessage.includes('只读')
        ? 'P2P_FORBIDDEN'
        : errMessage.includes('不存在')
          ? 'NOT_FOUND'
          : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pWorkflowListLocal]: async () => {
    try {
      const result = p2pWorkflowSyncService.listLocalP2pWorkflowShareTargets()
      return ipcOk(P2pWorkflowListLocalOutputSchema.parse(result))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to list local workflows')
      return ipcErr({ code: 'INTERNAL_ERROR', message: errMessage, retryable: false })
    }
  },
}
