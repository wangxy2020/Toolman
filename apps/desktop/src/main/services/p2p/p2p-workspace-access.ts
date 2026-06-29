import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import {
  P2pMemberRepository,
  P2pWorkspaceRepository,
  type P2pWorkspaceRow,
} from '@toolman/db'
import type { P2pWorkspace } from '@toolman/shared'
import { isWorkspaceVipPoolEnabled } from '@toolman/shared'
import { getDatabase } from '../../bootstrap/database'
import { getP2pDeviceInfo } from './p2p-device-identity.service'

export function getWorkspaceRepo(): P2pWorkspaceRepository {
  return new P2pWorkspaceRepository(getDatabase())
}

export function getMemberRepo(): P2pMemberRepository {
  return new P2pMemberRepository(getDatabase())
}

export function resolveP2pWorkspaceStoragePath(workspaceId: string): string {
  return join(app.getPath('userData'), 'p2p', 'workspaces', workspaceId)
}

export function ensureWorkspaceDir(workspaceId: string): void {
  const dir = resolveP2pWorkspaceStoragePath(workspaceId)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

function mapWorkspaceRow(row: P2pWorkspaceRow, memberCount: number): P2pWorkspace {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    ownerDeviceId: row.ownerDeviceId,
    ownerIdentityId: row.ownerIdentityId,
    maxMembers: row.maxMembers,
    vipPoolEnabled: isWorkspaceVipPoolEnabled(row.settingsJson),
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

export function assertWorkspaceAccess(workspaceId: string): P2pWorkspaceRow {
  const row = getWorkspaceRepo().findById(workspaceId)
  if (!row) {
    throw new Error('群组不存在')
  }
  if (row.status === 'dissolved') {
    throw new Error('群组不存在')
  }

  const device = getP2pDeviceInfo()
  const member = getMemberRepo().findByWorkspaceAndDevice(workspaceId, device.deviceId)
  if (!member || (member.status !== 'active' && member.status !== 'invited')) {
    throw new Error('无权访问该群组')
  }

  return row
}

export function assertOwner(workspaceId: string): P2pWorkspaceRow {
  const row = assertWorkspaceAccess(workspaceId)
  const device = getP2pDeviceInfo()
  if (row.ownerDeviceId !== device.deviceId) {
    throw new Error('仅群主可执行此操作')
  }
  return row
}
