import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { app } from 'electron'
import {
  P2pInviteRepository,
  P2pMemberRepository,
  P2pPeerRepository,
  P2pWorkspaceRepository,
  identities,
  type P2pWorkspaceMemberRow,
  type P2pWorkspaceRow,
} from '@toolman/db'
import type { P2pMember, P2pWorkspace } from '@toolman/shared'
import {
  inferMemberDeviceKind,
  isMemberRecentlySeen,
  parseP2pClientDeviceKind,
  preferUsableMemberIdentityId,
  resolvePeerMemberDisplayName,
} from '@toolman/shared'
import { getDatabase } from '../../bootstrap/database'
import { getLocalIdentityId } from '../local-identity'
import * as p2pConnectionService from './p2p-connection.service'
import { isP2pPeerDiscoverableOnline, listP2pDiscoveredNodes } from './p2p-discovery.service'
import { getP2pDeviceInfo, getP2pPersonIdentityId } from './p2p-device-identity.service'
import { ensureLinkedIdentityRow } from './p2p-linked-identity.service'

export const DEFAULT_IDENTITY_ID = '00000000-0000-0000-0000-000000000001'

export function getWorkspaceRepo(): P2pWorkspaceRepository {
  return new P2pWorkspaceRepository(getDatabase())
}

export function getMemberRepo(): P2pMemberRepository {
  return new P2pMemberRepository(getDatabase())
}

export function getPeerRepo(): P2pPeerRepository {
  return new P2pPeerRepository(getDatabase())
}

export function getInviteRepo(): P2pInviteRepository {
  return new P2pInviteRepository(getDatabase())
}

export function getIdentityDisplayName(): string {
  const db = getDatabase()
  const row = db
    .select()
    .from(identities)
    .where(eq(identities.id, getLocalIdentityId()))
    .get()
  return row?.displayName ?? '本地用户'
}

export function ensureWorkspaceDir(workspaceId: string): void {
  const dir = join(app.getPath('userData'), 'p2p', 'workspaces', workspaceId)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

export function mapWorkspaceRow(row: P2pWorkspaceRow, memberCount: number): P2pWorkspace {
  const localDeviceId = getP2pDeviceInfo().deviceId
  const ownerIdentityId =
    row.ownerDeviceId === localDeviceId
      ? (preferUsableMemberIdentityId(getP2pPersonIdentityId(), row.ownerIdentityId) ??
        row.ownerIdentityId)
      : row.ownerIdentityId
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    ownerDeviceId: row.ownerDeviceId,
    ownerIdentityId,
    maxMembers: row.maxMembers,
    status: row.status,
    memberCount,
    lastEventSeq: row.lastEventSeq,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  }
}

export function toWorkspaceDto(row: P2pWorkspaceRow): P2pWorkspace {
  const memberCount = getMemberRepo().countActiveByWorkspace(row.id)
  return mapWorkspaceRow(row, memberCount)
}

function getIdentityDisplayNameById(identityId: string | null | undefined): string | undefined {
  if (!preferUsableMemberIdentityId(identityId)) return undefined
  const db = getDatabase()
  const row = db
    .select()
    .from(identities)
    .where(eq(identities.id, identityId!.trim()))
    .get()
  const name = row?.displayName?.trim()
  return name || undefined
}

function resolveMemberOnline(row: P2pWorkspaceMemberRow, workspaceId: string): boolean {
  const localDeviceId = getP2pDeviceInfo().deviceId
  if (row.deviceId === localDeviceId) return true

  if (
    p2pConnectionService
      .getKnownP2pConnections()
      .some((item) => item.peerDeviceId === row.deviceId && item.state === 'connected')
  ) {
    return true
  }

  if (isP2pPeerDiscoverableOnline(row.deviceId)) return true

  const peer = getPeerRepo().findByWorkspaceAndDevice(workspaceId, row.deviceId)
  const lastSeenAt = row.lastSeenAt?.getTime() ?? peer?.lastSeenAt?.getTime() ?? null
  return isMemberRecentlySeen(lastSeenAt)
}

function parseCertDeviceKind(
  certJson: string | null | undefined,
): ReturnType<typeof parseP2pClientDeviceKind> {
  if (!certJson?.trim()) return undefined
  try {
    const parsed = JSON.parse(certJson) as { deviceKind?: unknown }
    return parseP2pClientDeviceKind(parsed.deviceKind)
  } catch {
    return undefined
  }
}

export function mapMemberRow(row: P2pWorkspaceMemberRow, workspaceId: string): P2pMember {
  const peer = getPeerRepo().findByWorkspaceAndDevice(workspaceId, row.deviceId)
  const localDeviceId = getP2pDeviceInfo().deviceId
  const isLocal = row.deviceId === localDeviceId
  const identityId = isLocal
    ? (preferUsableMemberIdentityId(getP2pPersonIdentityId(), row.identityId) ?? row.identityId)
    : row.identityId
  const displayName = resolvePeerMemberDisplayName(
    isLocal ? getIdentityDisplayName() : undefined,
    row.displayName,
    getIdentityDisplayNameById(identityId),
  )
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    identityId,
    deviceId: row.deviceId,
    displayName,
    role: row.role,
    status: row.status,
    deviceKind: inferMemberDeviceKind(row.deviceId, parseCertDeviceKind(row.certJson)),
    online: resolveMemberOnline(row, workspaceId),
    connectionMode: p2pConnectionService.getPeerConnectionMode(row.deviceId),
    lastSeenAt: row.lastSeenAt?.getTime() ?? peer?.lastSeenAt?.getTime(),
    joinedAt: row.joinedAt?.getTime(),
  }
}

export function shouldInitiatePeerConnection(localDeviceId: string, peerDeviceId: string): boolean {
  return localDeviceId < peerDeviceId
}

export function ensureOwnerMemberRecord(workspaceId: string): void {
  const workspace = getWorkspaceRepo().findById(workspaceId)
  if (!workspace) return

  const device = getP2pDeviceInfo()
  if (workspace.ownerDeviceId === device.deviceId) {
    return
  }

  const memberRepo = getMemberRepo()
  const existing = memberRepo.findByWorkspaceAndDevice(workspaceId, workspace.ownerDeviceId)
  if (existing?.status === 'active') {
    return
  }

  const discovered = listP2pDiscoveredNodes(false).find(
    (node) => node.deviceId === workspace.ownerDeviceId,
  )
  const displayName = discovered?.userName ?? '群主'

  ensureLinkedIdentityRow(workspace.ownerIdentityId, displayName)

  if (existing) {
    memberRepo.update({
      id: existing.id,
      displayName,
      role: 'owner',
      status: 'active',
      joinedAt: existing.joinedAt ?? new Date(),
    })
    return
  }

  memberRepo.create({
    workspaceId,
    identityId: workspace.ownerIdentityId,
    deviceId: workspace.ownerDeviceId,
    displayName,
    role: 'owner',
    status: 'active',
    joinedAt: new Date(),
  })
}

/** Shared group workspace when local user and peer are owner/member of the same group. */
export function resolveSharedMembershipWorkspaceId(peerDeviceId: string): string | undefined {
  const localDeviceId = getP2pDeviceInfo().deviceId
  if (peerDeviceId === localDeviceId) return undefined

  const memberRepo = getMemberRepo()
  const workspaceRepo = getWorkspaceRepo()

  for (const membership of memberRepo.listVisibleMembershipsByDevice(localDeviceId)) {
    if (membership.status !== 'invited' && membership.status !== 'active') continue
    const workspace = workspaceRepo.findById(membership.workspaceId)
    if (workspace?.ownerDeviceId === peerDeviceId) {
      return membership.workspaceId
    }
  }

  for (const workspace of workspaceRepo.listByOwnerDevice(localDeviceId)) {
    const member = memberRepo.findByWorkspaceAndDevice(workspace.id, peerDeviceId)
    if (member && (member.status === 'invited' || member.status === 'active')) {
      return workspace.id
    }
  }

  return undefined
}
