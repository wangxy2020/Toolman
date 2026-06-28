import { toErrorMessage } from '@toolman/shared'
import { logStructured } from '../structured-log.service'
import type { P2pMember } from '@toolman/shared'
import * as p2pConnectionService from './p2p-connection.service'
import { listP2pDiscoveredNodes, isP2pDiscoveryRunning, isP2pPeerDiscoverableOnline, startP2pDiscovery } from './p2p-discovery.service'
import { applyP2pNetworkConfig } from './p2p-network.config'
import { getP2pDeviceInfo } from './p2p-device-identity.service'
import { P2pBridge } from './p2p-bridge'
import { encodeReplicationMessage } from './p2p-sync-protocol'
import {
  signMemberSyncRequestWireMessage,
  signMemberSyncResponseWireMessage,
  verifyMemberSyncRequestWireMessage,
  verifyMemberSyncResponseWireMessage,
  type SignedMemberSyncRequestWire,
  type SignedMemberSyncResponseWire,
} from './p2p-member-sync-signing.service'
import { checkReplayGuard } from './p2p-replay-guard.service'
import {
  getMemberRepo,
  getWorkspaceRepo,
  resolveSharedMembershipWorkspaceId,
} from './p2p-member-shared'
import { connectToOwnerPeer, applyRemoteMemberJoin } from './p2p-member-join.service'
import { loadWorkspaceKey } from './p2p-workspace-key.store'

async function requestMemberSyncFromPeer(
  workspaceId: string,
  peerDeviceId: string,
): Promise<void> {
  const signed = signMemberSyncRequestWireMessage(workspaceId)
  const payload = encodeReplicationMessage(signed)
  await P2pBridge.connectionSend(peerDeviceId, 'events', payload)
}

const ownerConnectInFlight = new Map<string, Promise<void>>()
const ownerConnectLastRunAt = new Map<string, number>()
const OWNER_CONNECT_COOLDOWN_MS = 5_000

export async function ensureMemberConnectsToOwner(
  workspaceId: string,
  options?: { immediate?: boolean },
): Promise<void> {
  const workspace = getWorkspaceRepo().findById(workspaceId)
  if (!workspace) return

  const device = getP2pDeviceInfo()
  if (workspace.ownerDeviceId === device.deviceId) return

  if (!loadWorkspaceKey(workspaceId)) {
    return
  }

  const inFlight = ownerConnectInFlight.get(workspaceId)
  if (inFlight) {
    await inFlight
    return
  }

  if (!options?.immediate) {
    const lastRun = ownerConnectLastRunAt.get(workspaceId) ?? 0
    if (Date.now() - lastRun < OWNER_CONNECT_COOLDOWN_MS) {
      return
    }
  }

  applyP2pNetworkConfig()
  if (!isP2pDiscoveryRunning()) {
    startP2pDiscovery()
  }
  p2pConnectionService.startP2pConnectionMonitor()

  const promise = connectToOwnerPeer(
    workspace.ownerDeviceId,
    workspaceId,
    'member connect to owner failed',
  ).then(() => undefined).finally(() => {
    ownerConnectInFlight.delete(workspaceId)
    ownerConnectLastRunAt.set(workspaceId, Date.now())
  })
  ownerConnectInFlight.set(workspaceId, promise)
  await promise
}

const reconcileInFlight = new Map<string, Promise<void>>()
const reconcileLastRunAt = new Map<string, number>()
const RECONCILE_COOLDOWN_MS = 8_000

export async function reconcileOwnerWorkspaceMembers(
  workspaceId: string,
  options?: { immediate?: boolean },
): Promise<void> {
  const inFlight = reconcileInFlight.get(workspaceId)
  if (inFlight) {
    await inFlight
    return
  }

  if (!options?.immediate) {
    const lastRun = reconcileLastRunAt.get(workspaceId) ?? 0
    if (Date.now() - lastRun < RECONCILE_COOLDOWN_MS) {
      return
    }
  }

  const promise = reconcileOwnerWorkspaceMembersNow(workspaceId).finally(() => {
    reconcileInFlight.delete(workspaceId)
    reconcileLastRunAt.set(workspaceId, Date.now())
  })
  reconcileInFlight.set(workspaceId, promise)
  await promise
}

export async function runOwnerPeerReconcileTick(): Promise<void> {
  try {
    await reconcileOwnerPeerConnections()
  } catch (error) {
    const message = toErrorMessage(error, 'owner reconcile tick failed')
    logStructured('p2p', 'warn', `owner reconcile tick failed: ${message}`)
  }
}

export async function runMemberOwnerConnectTick(options?: { immediate?: boolean }): Promise<void> {
  const device = getP2pDeviceInfo()
  const memberships = getMemberRepo().listVisibleMembershipsByDevice(device.deviceId)
  const workspaceRepo = getWorkspaceRepo()

  for (const membership of memberships) {
    const workspace = workspaceRepo.findById(membership.workspaceId)
    if (!workspace || workspace.ownerDeviceId === device.deviceId) continue
    if (!loadWorkspaceKey(membership.workspaceId)) continue
    if (p2pConnectionService.isPeerConnected(workspace.ownerDeviceId)) continue
    try {
      await ensureMemberConnectsToOwner(membership.workspaceId, {
        immediate: options?.immediate ?? false,
      })
    } catch (error) {
      const message = toErrorMessage(error, 'member owner connect tick failed')
      logStructured(
        'p2p',
        'warn',
        `member owner connect tick failed for ${membership.workspaceId}: ${message}`,
      )
    }
  }
}

async function reconcileOwnerPeerConnections(): Promise<void> {
  const device = getP2pDeviceInfo()
  const workspaces = getWorkspaceRepo().listByOwnerDevice(device.deviceId)
  if (workspaces.length === 0) return

  applyP2pNetworkConfig()
  if (!isP2pDiscoveryRunning()) {
    startP2pDiscovery()
  }
  p2pConnectionService.startP2pConnectionMonitor()

  const peerConnectAttempted = new Set<string>()

  const attemptOwnerConnect = async (workspaceId: string, peerDeviceId: string, context: string) => {
    if (peerDeviceId === device.deviceId) return
    if (peerConnectAttempted.has(peerDeviceId)) return
    if (p2pConnectionService.isPeerConnected(peerDeviceId)) return
    if (!isP2pPeerDiscoverableOnline(peerDeviceId)) return
    peerConnectAttempted.add(peerDeviceId)
    try {
      await p2pConnectionService.resetStalePeerConnection(peerDeviceId)
      await p2pConnectionService.ensurePeerReadyForWorkspace(peerDeviceId, workspaceId)
    } catch (error) {
      const message = toErrorMessage(error, context)
      logStructured('p2p', 'warn', `${context} for ${peerDeviceId.slice(0, 8)}: ${message}`)
    }
  }

  for (const workspace of workspaces) {
    const activeMemberDeviceIds = new Set(
      getMemberRepo()
        .listByWorkspace(workspace.id, 'active')
        .map((item) => item.deviceId),
    )
    const invitedMemberDeviceIds = new Set(
      getMemberRepo()
        .listByWorkspace(workspace.id, 'invited')
        .map((item) => item.deviceId),
    )

    for (const member of getMemberRepo().listByWorkspace(workspace.id, 'active')) {
      await attemptOwnerConnect(workspace.id, member.deviceId, 'owner connect to active member failed')
    }

    for (const member of getMemberRepo().listByWorkspace(workspace.id, 'invited')) {
      await attemptOwnerConnect(workspace.id, member.deviceId, 'owner connect to invited member failed')
    }

    for (const node of listP2pDiscoveredNodes(true)) {
      if (node.deviceId === device.deviceId || activeMemberDeviceIds.has(node.deviceId)) {
        continue
      }
      if (invitedMemberDeviceIds.has(node.deviceId)) {
        continue
      }
      const sharedWorkspaceId = resolveSharedMembershipWorkspaceId(node.deviceId)
      if (sharedWorkspaceId && sharedWorkspaceId !== workspace.id) {
        continue
      }
      await attemptOwnerConnect(workspace.id, node.deviceId, 'owner reconcile connect failed')
    }
  }

  const connections = await p2pConnectionService.listP2pConnections()
  for (const workspace of workspaces) {
    const activeMemberDeviceIds = new Set(
      getMemberRepo()
        .listByWorkspace(workspace.id, 'active')
        .map((item) => item.deviceId),
    )

    for (const connection of connections) {
      if (connection.state !== 'connected') continue
      if (connection.peerDeviceId === device.deviceId) continue
      if (activeMemberDeviceIds.has(connection.peerDeviceId)) continue
      if (connection.workspaceId && connection.workspaceId !== workspace.id) continue
      try {
        await requestMemberSyncFromPeer(workspace.id, connection.peerDeviceId)
      } catch (error) {
        const message = toErrorMessage(error, 'member sync request failed')
        logStructured('p2p', 'warn', `owner member sync request failed for ${connection.peerDeviceId}: ${message}`)
      }
    }
  }
}

async function reconcileOwnerWorkspaceMembersNow(_workspaceId: string): Promise<void> {
  await reconcileOwnerPeerConnections()
}

export async function handleMemberSyncRequest(
  peerDeviceId: string,
  message: SignedMemberSyncRequestWire,
): Promise<void> {
  if (message.v !== 2 || !message.signature || !message.signerDeviceId || !message.at) {
    logStructured('p2p', 'warn', `dropped unsigned member.sync_request from ${peerDeviceId.slice(0, 8)}`)
    return
  }

  const verified = verifyMemberSyncRequestWireMessage(peerDeviceId, message)
  if (!verified.ok) {
    logStructured('p2p', 'warn', `dropped member.sync_request from ${peerDeviceId.slice(0, 8)}: ${verified.reason}`)
    return
  }

  const replay = checkReplayGuard({
    scope: `member-sync-req:${message.workspaceId}`,
    signerId: peerDeviceId,
    at: message.at,
    payloadHash: message.signature,
  })
  if (!replay.ok) {
    logStructured('p2p', 'warn', `dropped replay member.sync_request from ${peerDeviceId.slice(0, 8)}: ${replay.reason}`)
    return
  }

  const workspace = getWorkspaceRepo().findById(message.workspaceId)
  if (!workspace || workspace.ownerDeviceId !== peerDeviceId) {
    return
  }

  const device = getP2pDeviceInfo()
  const memberRow = getMemberRepo().findByWorkspaceAndDevice(message.workspaceId, device.deviceId)
  if (
    !memberRow ||
    (memberRow.status !== 'active' && memberRow.status !== 'invited')
  ) {
    return
  }

  const signed = signMemberSyncResponseWireMessage({
    workspaceId: message.workspaceId,
    member: {
      id: memberRow.id,
      workspaceId: message.workspaceId,
      deviceId: memberRow.deviceId,
      displayName: memberRow.displayName,
      role: memberRow.role,
      identityId: memberRow.identityId,
    },
  })
  const payload = encodeReplicationMessage(signed)
  await P2pBridge.connectionSend(peerDeviceId, 'events', payload)
}

export function handleMemberSyncResponse(
  peerDeviceId: string,
  message: SignedMemberSyncResponseWire,
): void {
  if (message.v !== 2 || !message.signature || !message.signerDeviceId || !message.at) {
    logStructured('p2p', 'warn', `dropped unsigned member.sync_response from ${peerDeviceId.slice(0, 8)}`)
    return
  }

  const verified = verifyMemberSyncResponseWireMessage(peerDeviceId, message)
  if (!verified.ok) {
    logStructured('p2p', 'warn', `dropped member.sync_response from ${peerDeviceId.slice(0, 8)}: ${verified.reason}`)
    return
  }

  const replay = checkReplayGuard({
    scope: `member-sync:${message.workspaceId}`,
    signerId: peerDeviceId,
    at: message.at,
    payloadHash: message.member.id,
  })
  if (!replay.ok) {
    logStructured('p2p', 'warn', `dropped replay member.sync_response from ${peerDeviceId.slice(0, 8)}: ${replay.reason}`)
    return
  }

  void applyRemoteMemberJoin(
    {
      workspaceId: message.workspaceId,
      member: {
        id: message.member.id,
        workspaceId: message.workspaceId,
        identityId: message.member.identityId ?? '',
        deviceId: message.member.deviceId,
        displayName: message.member.displayName,
        role: message.member.role as P2pMember['role'],
        status: 'invited',
        online: true,
      },
      peerDeviceId,
      remoteDevicePublicKey: message.member.devicePublicKey,
    },
    { requirePeerTrust: false, allowReactivation: false, forcePendingApproval: true },
  ).catch((error) => {
    logStructured('p2p', 'warn', `member.sync_response apply failed: ${toErrorMessage(error, 'member.sync_response apply failed')}`)
  })
}
