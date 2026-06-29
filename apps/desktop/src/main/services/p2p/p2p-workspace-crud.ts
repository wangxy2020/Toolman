import { hashWorkspaceKey } from '@toolman/db'
import type { P2pWorkspace, P2pWorkspaceListFilter } from '@toolman/shared'
import {
  P2pWorkspaceCreateInputSchema,
  P2pWorkspaceUpdateInputSchema,
} from '@toolman/shared'
import { generateWorkspaceKey } from './p2p-crypto.service'
import { assertRegisteredForP2p } from './p2p-auth.guard'
import { resolveWorkspaceMaxMembers } from '../auth/entitlement.service'
import {
  maybeActivateWorkspaceVipPool,
  refreshOwnedWorkspaceVipPools,
} from './p2p-workspace-vip-pool.service'
import { createDefaultWorkspaceInvite } from './p2p-invite.service'
import { getP2pDeviceInfo } from './p2p-device-identity.service'
import { saveWorkspaceKey, loadAllWorkspaceKeys } from './p2p-workspace-key.store'
import { getIdentityDisplayName } from './p2p-member-shared'
import { appendP2pEvent } from './p2p-event.service'
import { startP2pConnectionMonitor } from './p2p-connection.service'
import { isP2pDiscoveryRunning, startP2pDiscovery } from './p2p-discovery.service'
import { applyP2pNetworkConfig } from './p2p-network.config'
import {
  assertOwner,
  assertWorkspaceAccess,
  ensureWorkspaceDir,
  getMemberRepo,
  getWorkspaceRepo,
  toWorkspaceDto,
} from './p2p-workspace-access'
import type { P2pWorkspaceRow } from '@toolman/db'

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

  const inviteToken = await createDefaultWorkspaceInvite(row.id)
  applyP2pNetworkConfig()
  if (!isP2pDiscoveryRunning()) {
    startP2pDiscovery()
  }
  startP2pConnectionMonitor()

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

  const owned = workspaceRepo.listByOwnerDevice(device.deviceId)
  const memberships = memberRepo.listActiveMembershipsByDevice(device.deviceId)
  const ownedIds = new Set(owned.map((row) => row.id))
  const activeMembershipIds = new Set(memberships.map((member) => member.workspaceId))

  const joined = memberships
    .filter((member) => !ownedIds.has(member.workspaceId))
    .map((member) => workspaceRepo.findById(member.workspaceId))
    .filter((row): row is P2pWorkspaceRow => row !== null && row.status !== 'dissolved')

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

export function listPendingP2pJoinRequestIds(): string[] {
  const device = getP2pDeviceInfo()
  const ownedIds = new Set(
    getWorkspaceRepo().listByOwnerDevice(device.deviceId).map((row) => row.id),
  )
  return getMemberRepo()
    .listVisibleMembershipsByDevice(device.deviceId)
    .filter((member) => member.status === 'invited' && !ownedIds.has(member.workspaceId))
    .map((member) => member.workspaceId)
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
