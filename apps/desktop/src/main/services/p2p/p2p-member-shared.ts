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
import { getDatabase } from '../../bootstrap/database'
import { getLocalIdentityId } from '../local-identity'
import * as p2pConnectionService from './p2p-connection.service'
import { isP2pPeerDiscoverableOnline } from './p2p-discovery.service'
import { getP2pDeviceInfo } from './p2p-device-identity.service'

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
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    ownerDeviceId: row.ownerDeviceId,
    ownerIdentityId: row.ownerIdentityId,
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

function resolveMemberOnline(row: P2pWorkspaceMemberRow, _workspaceId: string): boolean {
  const localDeviceId = getP2pDeviceInfo().deviceId
  if (row.deviceId === localDeviceId) return true

  if (
    p2pConnectionService
      .getKnownP2pConnections()
      .some((item) => item.peerDeviceId === row.deviceId && item.state === 'connected')
  ) {
    return true
  }

  return isP2pPeerDiscoverableOnline(row.deviceId)
}

export function mapMemberRow(row: P2pWorkspaceMemberRow, workspaceId: string): P2pMember {
  const peer = getPeerRepo().findByWorkspaceAndDevice(workspaceId, row.deviceId)
  const localDeviceId = getP2pDeviceInfo().deviceId
  const displayName =
    row.deviceId === localDeviceId ? getIdentityDisplayName() : row.displayName
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    identityId: row.identityId,
    deviceId: row.deviceId,
    displayName,
    role: row.role,
    status: row.status,
    online: resolveMemberOnline(row, workspaceId),
    connectionMode: p2pConnectionService.getPeerConnectionMode(row.deviceId),
    lastSeenAt: row.lastSeenAt?.getTime() ?? peer?.lastSeenAt?.getTime(),
    joinedAt: row.joinedAt?.getTime(),
  }
}

export function assertWorkspaceMemberAccess(workspaceId: string): P2pWorkspaceRow {
  const row = getWorkspaceRepo().findById(workspaceId)
  if (!row) {
    throw new Error('群组不存在')
  }

  const device = getP2pDeviceInfo()
  const member = getMemberRepo().findByWorkspaceAndDevice(workspaceId, device.deviceId)
  if (!member || member.status !== 'active') {
    throw new Error('无权访问该群组')
  }

  return row
}

export function shouldInitiatePeerConnection(localDeviceId: string, peerDeviceId: string): boolean {
  return localDeviceId < peerDeviceId
}
