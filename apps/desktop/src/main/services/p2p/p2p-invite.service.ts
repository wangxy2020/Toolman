import { randomUUID } from 'node:crypto'
import { logStructured } from '../structured-log.service'
import {
  P2pInviteRepository,
  P2pWorkspaceRepository,
  createP2pDeviceIdentityRepository,
  hashInviteToken,
  type P2pWorkspaceRow,
} from '@toolman/db'
import type { P2pInvitableMemberRole } from '@toolman/shared'
import {P2pMemberInviteInputSchema, toErrorMessage } from '@toolman/shared'
import { getDatabase } from '../../bootstrap/database'
import { getP2pDeviceInfo } from './p2p-device-identity.service'
import { getIdentityDisplayName } from './p2p-member-shared'
import { assertCanInvite as assertCanInviteMember } from './p2p-permission.guard'
import {
  buildInviteUrl,
  encodeInviteToken,
  INVITE_TOKEN_VERSION,
  signInvitePayload,
} from './p2p-invite.token'
import { loadWorkspaceKey } from './p2p-workspace-key.store'
import { P2pBridge } from './p2p-bridge'
import { startP2pConnectionMonitor } from './p2p-connection.service'
import { isP2pDiscoveryRunning, startP2pDiscovery } from './p2p-discovery.service'
import { applyP2pNetworkConfig } from './p2p-network.config'

async function ensureInviteNetworkingReady(): Promise<void> {
  applyP2pNetworkConfig()
  if (!isP2pDiscoveryRunning()) {
    startP2pDiscovery()
  }
  startP2pConnectionMonitor()
}

function beginInviteHandshake(inviteId: string): void {
  void (async () => {
    try {
      await P2pBridge.inviteWaitForAnswer(inviteId, 3600)
    } catch (error) {
      const message = toErrorMessage(error, String(error))
      logStructured('p2p', 'warn', `invite handshake ended: ${message}`)
    }
  })()
}

function getWorkspaceRepo(): P2pWorkspaceRepository {
  return new P2pWorkspaceRepository(getDatabase())
}

function getInviteRepo(): P2pInviteRepository {
  return new P2pInviteRepository(getDatabase())
}

function assertCanInvite(workspaceId: string): {
  workspace: P2pWorkspaceRow
  memberId: string
} {
  const workspace = getWorkspaceRepo().findById(workspaceId)
  if (!workspace) {
    throw new Error('群组不存在')
  }

  const member = assertCanInviteMember(workspaceId)
  return { workspace, memberId: member.id }
}

function resolveOwnerPublicKey(ownerDeviceId: string, fallback: string): string {
  const repo = createP2pDeviceIdentityRepository(getDatabase())
  const row = repo.getByDeviceId(ownerDeviceId)
  return row?.publicKey ?? fallback
}

export async function createP2pInvite(rawInput: unknown): Promise<{
  inviteToken: string
  inviteUrl: string
  qrData: string
  expiresAt: number
}> {
  const input = P2pMemberInviteInputSchema.parse(rawInput)
  const { workspace, memberId } = assertCanInvite(input.workspaceId)

  const workspaceKeyB64 = loadWorkspaceKey(workspace.id)
  if (!workspaceKeyB64) {
    throw new Error('群组密钥不可用，无法生成邀请')
  }

  const device = getP2pDeviceInfo()
  const ownerPublicKey = resolveOwnerPublicKey(workspace.ownerDeviceId, device.publicKey)
  const inviteId = randomUUID()
  const expiresInHours = input.expiresInHours ?? 72
  const expiresAt = Date.now() + expiresInHours * 60 * 60 * 1000
  const maxUses = input.maxUses ?? 1

  const signed = signInvitePayload({
    v: INVITE_TOKEN_VERSION,
    inviteId,
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    workspaceDescription: workspace.description,
    ownerDeviceId: workspace.ownerDeviceId,
    ownerIdentityId: workspace.ownerIdentityId,
    ownerPublicKey,
    ownerDisplayName: getIdentityDisplayName(),
    workspaceKeyB64,
    role: input.role,
    expiresAt,
    maxUses,
    issuerDeviceId: device.deviceId,
    issuerPublicKey: device.publicKey,
  })

  const inviteToken = encodeInviteToken(signed)
  getInviteRepo().create({
    workspaceId: workspace.id,
    tokenHash: hashInviteToken(inviteToken),
    role: input.role,
    createdBy: memberId,
    maxUses,
    expiresAt: new Date(expiresAt),
  })

  await ensureInviteNetworkingReady()
  const offerSdp = await P2pBridge.inviteCreateOffer(inviteId, workspace.id)
  beginInviteHandshake(inviteId)

  const inviteUrl = buildInviteUrl(inviteToken, offerSdp)
  return {
    inviteToken,
    inviteUrl,
    qrData: inviteUrl,
    expiresAt,
  }
}

export async function createDefaultWorkspaceInvite(workspaceId: string): Promise<string> {
  const result = await createP2pInvite({
    workspaceId,
    role: 'member' satisfies P2pInvitableMemberRole,
    maxUses: 1,
    expiresInHours: 72,
  })
  return result.inviteToken
}
