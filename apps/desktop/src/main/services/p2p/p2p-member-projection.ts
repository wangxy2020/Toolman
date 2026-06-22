import {
  P2pMemberRepository,
  P2pWorkspaceRepository,
  createP2pDeviceIdentityRepository,
} from '@toolman/db'
import type { P2pMemberRole, WorkspaceEvent } from '@toolman/shared'
import { getDatabase } from '../../bootstrap/database'
import { getP2pDeviceInfo } from './p2p-device-identity.service'

const DEFAULT_IDENTITY_ID = '00000000-0000-0000-0000-000000000001'

function getMemberRepo(): P2pMemberRepository {
  return new P2pMemberRepository(getDatabase())
}

function getWorkspaceRepo(): P2pWorkspaceRepository {
  return new P2pWorkspaceRepository(getDatabase())
}

function resolveIdentityId(deviceId: string, payloadIdentityId?: string): string {
  if (payloadIdentityId) return payloadIdentityId
  const row = createP2pDeviceIdentityRepository(getDatabase()).getByDeviceId(deviceId)
  return row?.identityId ?? DEFAULT_IDENTITY_ID
}

function parseMemberRole(value: unknown): P2pMemberRole {
  if (value === 'owner' || value === 'admin' || value === 'member' || value === 'readonly') {
    return value
  }
  return 'member'
}

export function projectMemberJoinedEvent(event: WorkspaceEvent): void {
  if (event.resourceType !== 'Member' || event.eventType !== 'Joined') {
    return
  }

  const deviceId =
    typeof event.payload.device_id === 'string' ? event.payload.device_id : event.sourceDeviceId
  if (!deviceId) return

  const localDeviceId = getP2pDeviceInfo().deviceId
  const memberRepo = getMemberRepo()
  const existingByDevice = memberRepo.findByWorkspaceAndDevice(event.workspaceId, deviceId)
  if (existingByDevice?.status === 'active') {
    return
  }

  const displayName =
    typeof event.payload.display_name === 'string' ? event.payload.display_name : '成员'
  const role = parseMemberRole(event.payload.role)
  const identityId = resolveIdentityId(
    deviceId,
    typeof event.payload.identity_id === 'string' ? event.payload.identity_id : undefined,
  )

  if (existingByDevice) {
    memberRepo.update({
      id: existingByDevice.id,
      displayName,
      role,
      status: 'active',
      joinedAt: new Date(event.timestamp),
    })
    void import('./p2p-member-mesh.service').then((module) => {
      void module.reconcileWorkspaceMemberMesh(event.workspaceId)
    })
    return
  }

  const existingById = memberRepo.findById(event.resourceId)
  if (existingById) {
    if (existingById.status !== 'active') {
      memberRepo.update({
        id: existingById.id,
        displayName,
        role,
        status: 'active',
        joinedAt: new Date(event.timestamp),
      })
    }
    void import('./p2p-member-mesh.service').then((module) => {
      void module.reconcileWorkspaceMemberMesh(event.workspaceId)
    })
    return
  }

  // 本地刚加入时已写入成员行，避免重复插入
  if (deviceId === localDeviceId) {
    return
  }

  memberRepo.create({
    id: event.resourceId,
    workspaceId: event.workspaceId,
    identityId,
    deviceId,
    displayName,
    role,
    status: 'active',
    joinedAt: new Date(event.timestamp),
  })

  void import('./p2p-member-mesh.service').then((module) => {
    void module.reconcileWorkspaceMemberMesh(event.workspaceId)
  })
}

export function projectMemberLeftEvent(event: WorkspaceEvent): void {
  if (event.resourceType !== 'Member' || event.eventType !== 'Left') {
    return
  }

  const memberId =
    typeof event.payload.member_id === 'string' ? event.payload.member_id : event.resourceId
  const memberRepo = getMemberRepo()
  const existing = memberRepo.findById(memberId)
  if (!existing || existing.workspaceId !== event.workspaceId) {
    return
  }

  memberRepo.update({
    id: existing.id,
    status: 'left',
  })
}

export function syncWorkspaceNameFromJoinEvent(event: WorkspaceEvent): void {
  if (event.resourceType !== 'Member' || event.eventType !== 'Joined') {
    return
  }

  const workspaceName =
    typeof event.payload.workspace_name === 'string' ? event.payload.workspace_name.trim() : ''
  if (!workspaceName) return

  const workspace = getWorkspaceRepo().findById(event.workspaceId)
  if (!workspace || workspace.name.trim()) return

  getWorkspaceRepo().update({
    id: event.workspaceId,
    name: workspaceName,
  })
}
