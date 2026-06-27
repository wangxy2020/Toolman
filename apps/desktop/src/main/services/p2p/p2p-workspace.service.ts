import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import {
  P2pMemberRepository,
  P2pWorkspaceRepository,
  hashWorkspaceKey,
  type P2pWorkspaceRow,
} from '@toolman/db'
import type { P2pWorkspace, P2pWorkspaceListFilter } from '@toolman/shared'
import {
  P2pWorkspaceCreateInputSchema,
  P2pWorkspaceUpdateInputSchema,
  isWorkspaceVipPoolEnabled,
} from '@toolman/shared'
import { getDatabase } from '../../bootstrap/database'
import { logStructured } from '../structured-log.service'
import { generateWorkspaceKey } from './p2p-crypto.service'
import { assertRegisteredForP2p } from './p2p-auth.guard'
import { resolveWorkspaceMaxMembers } from '../auth/entitlement.service'
import {
  maybeActivateWorkspaceVipPool,
  refreshOwnedWorkspaceVipPools,
} from './p2p-workspace-vip-pool.service'
import { createDefaultWorkspaceInvite } from './p2p-invite.service'
import { getP2pDeviceInfo } from './p2p-device-identity.service'
import {
  loadAllWorkspaceKeys,
  removeWorkspaceKey,
  saveWorkspaceKey,
} from './p2p-workspace-key.store'
import { getIdentityDisplayName } from './p2p-member-shared'
import { appendP2pEvent } from './p2p-event.service'
import * as p2pConnectionService from './p2p-connection.service'
import { isP2pDiscoveryRunning, startP2pDiscovery } from './p2p-discovery.service'
import { applyP2pNetworkConfig } from './p2p-network.config'

function getWorkspaceRepo(): P2pWorkspaceRepository {
  return new P2pWorkspaceRepository(getDatabase())
}

function getMemberRepo(): P2pMemberRepository {
  return new P2pMemberRepository(getDatabase())
}

function resolveP2pWorkspaceStoragePath(workspaceId: string): string {
  return join(app.getPath('userData'), 'p2p', 'workspaces', workspaceId)
}

export function getP2pWorkspaceStoragePath(workspaceId: string): string {
  assertWorkspaceAccess(workspaceId)
  return resolveP2pWorkspaceStoragePath(workspaceId)
}

function ensureWorkspaceDir(workspaceId: string): void {
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

function toWorkspaceDto(row: P2pWorkspaceRow): P2pWorkspace {
  const memberCount = getMemberRepo().countActiveByWorkspace(row.id)
  return mapWorkspaceRow(row, memberCount)
}

function assertWorkspaceAccess(workspaceId: string): P2pWorkspaceRow {
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

function assertOwner(workspaceId: string): P2pWorkspaceRow {
  const row = assertWorkspaceAccess(workspaceId)
  const device = getP2pDeviceInfo()
  if (row.ownerDeviceId !== device.deviceId) {
    throw new Error('仅群主可执行此操作')
  }
  return row
}

export function bootstrapP2pWorkspaceKeys(): void {
  loadAllWorkspaceKeys()
}

export async function createP2pWorkspace(rawInput: unknown): Promise<{
  workspace: P2pWorkspace
  inviteToken: string
}> {
  assertRegisteredForP2p()
  const input = P2pWorkspaceCreateInputSchema.parse(rawInput)
  const device = getP2pDeviceInfo()
  const workspaceKey = generateWorkspaceKey()
  const workspaceKeyHash = hashWorkspaceKey(workspaceKey)

  const row = getWorkspaceRepo().create({
    name: input.name,
    description: input.description,
    maxMembers: resolveWorkspaceMaxMembers(input.maxMembers),
    ownerDeviceId: device.deviceId,
    ownerIdentityId: device.identityId,
    workspaceKeyHash,
  })

  saveWorkspaceKey(row.id, workspaceKey)
  ensureWorkspaceDir(row.id)

  const now = new Date()
  const ownerMember = getMemberRepo().create({
    workspaceId: row.id,
    identityId: device.identityId,
    deviceId: device.deviceId,
    displayName: getIdentityDisplayName(),
    role: 'owner',
    status: 'active',
    joinedAt: now,
  })

  await appendP2pEvent({
    workspaceId: row.id,
    resourceType: 'Workspace',
    resourceId: row.id,
    operatorId: ownerMember.id,
    eventType: 'Created',
    payload: {
      name: row.name,
      description: row.description ?? null,
    },
  })

  await appendP2pEvent({
    workspaceId: row.id,
    resourceType: 'Member',
    resourceId: ownerMember.id,
    operatorId: ownerMember.id,
    eventType: 'Joined',
    payload: {
      member_id: ownerMember.id,
      device_id: device.deviceId,
      identity_id: device.identityId,
      display_name: getIdentityDisplayName(),
      role: 'owner',
      workspace_name: row.name,
    },
  })

  const inviteToken = await createDefaultWorkspaceInvite(row.id).catch((error) => {
    logStructured(
      'p2p',
      'warn',
      `default invite skipped: ${error instanceof Error ? error.message : String(error)}`,
    )
    return ''
  })
  applyP2pNetworkConfig()
  if (!isP2pDiscoveryRunning()) {
    startP2pDiscovery()
  }
  p2pConnectionService.startP2pConnectionMonitor()

  return {
    workspace: toWorkspaceDto(row),
    inviteToken,
  }
}

export async function ensureDefaultOwnedP2pWorkspace(): Promise<P2pWorkspace | null> {
  try {
    assertRegisteredForP2p()
  } catch {
    return null
  }

  const device = getP2pDeviceInfo()
  const owned = getWorkspaceRepo().listByOwnerDevice(device.deviceId)
  if (owned.some((row) => row.name === '默认群组')) {
    return null
  }

  const { workspace } = await createP2pWorkspace({ name: '默认群组' })
  return workspace
}

export function listP2pWorkspaces(filter: P2pWorkspaceListFilter = 'all'): P2pWorkspace[] {
  refreshOwnedWorkspaceVipPools()
  const device = getP2pDeviceInfo()
  const workspaceRepo = getWorkspaceRepo()
  const memberRepo = getMemberRepo()

  // 「我的群组」按本机 device 是否为群主判定；不能仅用 identityId（双实例/未分账户时共用默认 identity）。
  const owned = workspaceRepo.listByOwnerDevice(device.deviceId)
  const memberships = memberRepo.listActiveMembershipsByDevice(device.deviceId)
  const ownedIds = new Set(owned.map((row) => row.id))
  const activeMembershipIds = new Set(memberships.map((member) => member.workspaceId))

  const joined = memberships
    .filter((member) => !ownedIds.has(member.workspaceId))
    .map((member) => workspaceRepo.findById(member.workspaceId))
    .filter((row): row is P2pWorkspaceRow => row !== null)

  let rows: P2pWorkspaceRow[]
  switch (filter) {
    case 'mine':
      rows = [...owned].sort((a, b) => {
        if (a.name === '默认群组' && b.name !== '默认群组') return -1
        if (b.name === '默认群组' && a.name !== '默认群组') return 1
        return b.updatedAt.getTime() - a.updatedAt.getTime()
      })
      break
    case 'joined':
      rows = joined
      break
    case 'all':
    default: {
      const byId = new Map<string, P2pWorkspaceRow>()
      for (const row of [...owned, ...joined]) {
        byId.set(row.id, row)
      }
      rows = [...byId.values()].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      break
    }
  }

  return rows
    .filter((row) => activeMembershipIds.has(row.id))
    .map((row) => toWorkspaceDto(row))
}

export function getP2pWorkspace(id: string): P2pWorkspace {
  maybeActivateWorkspaceVipPool(id)
  const row = assertWorkspaceAccess(id)
  return toWorkspaceDto(row)
}

export function updateP2pWorkspace(rawInput: unknown): P2pWorkspace {
  const input = P2pWorkspaceUpdateInputSchema.parse(rawInput)
  assertOwner(input.id)

  const settingsJson =
    input.settings !== undefined ? JSON.stringify(input.settings) : undefined

  const updated = getWorkspaceRepo().update({
    id: input.id,
    name: input.name,
    description: input.description,
    settingsJson,
  })

  if (!updated) {
    throw new Error('群组不存在')
  }

  return toWorkspaceDto(updated)
}

export function deleteP2pWorkspace(id: string): void {
  assertOwner(id)
  const deleted = getWorkspaceRepo().softDelete(id)
  if (!deleted) {
    throw new Error('群组不存在')
  }
  removeWorkspaceKey(id)
}

export function leaveP2pWorkspace(id: string): void {
  const row = assertWorkspaceAccess(id)
  const device = getP2pDeviceInfo()

  if (row.ownerDeviceId === device.deviceId) {
    throw new Error('群主不能退出群组，请解散群组')
  }

  const member = getMemberRepo().findByWorkspaceAndDevice(id, device.deviceId)
  if (!member) {
    throw new Error('你不是该群组成员')
  }

  getMemberRepo().update({
    id: member.id,
    status: 'left',
  })
  removeWorkspaceKey(id)
}
