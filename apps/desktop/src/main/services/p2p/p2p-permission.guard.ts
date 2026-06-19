import { P2pMemberRepository, type P2pWorkspaceMemberRow } from '@toolman/db'
import type { P2pMemberRole, P2pSharedResourcePermission } from '@toolman/shared'
import {
  canManageWorkspaceMembers,
  canWriteWorkspace,
  isWorkspaceAdmin,
} from '@toolman/shared'
import { getDatabase } from '../../bootstrap/database'
import { getP2pDeviceInfo } from './p2p-device-identity.service'

export class P2pPermissionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'P2pPermissionError'
  }
}

function getMemberRepo(): P2pMemberRepository {
  return new P2pMemberRepository(getDatabase())
}

export function getActiveWorkspaceMember(workspaceId: string): P2pWorkspaceMemberRow {
  const device = getP2pDeviceInfo()
  const member = getMemberRepo().findByWorkspaceAndDevice(workspaceId, device.deviceId)
  if (!member || member.status !== 'active') {
    throw new P2pPermissionError('无权访问该群组')
  }
  return member
}

export function assertWorkspaceMemberAccess(workspaceId: string): P2pWorkspaceMemberRow {
  return getActiveWorkspaceMember(workspaceId)
}

export function assertCanWriteWorkspace(workspaceId: string): P2pWorkspaceMemberRow {
  const member = assertWorkspaceMemberAccess(workspaceId)
  if (!canWriteWorkspace(member.role)) {
    throw new P2pPermissionError('只读成员无法执行此操作')
  }
  return member
}

export const assertCanShareResource = assertCanWriteWorkspace
export const assertCanUploadFiles = assertCanWriteWorkspace

export function assertCanInvite(workspaceId: string): P2pWorkspaceMemberRow {
  const member = assertWorkspaceMemberAccess(workspaceId)
  if (!canManageWorkspaceMembers(member.role)) {
    throw new P2pPermissionError('仅群主或管理员可邀请成员')
  }
  return member
}

export function assertWorkspaceOwner(workspaceId: string): P2pWorkspaceMemberRow {
  const member = assertWorkspaceMemberAccess(workspaceId)
  if (member.role !== 'owner') {
    throw new P2pPermissionError('仅群主可执行此操作')
  }
  return member
}

export function assertCanManageMembers(
  workspaceId: string,
  targetMemberId: string,
): { actor: P2pWorkspaceMemberRow; target: P2pWorkspaceMemberRow } {
  const actor = assertWorkspaceMemberAccess(workspaceId)
  if (!canManageWorkspaceMembers(actor.role)) {
    throw new P2pPermissionError('仅群主或管理员可管理成员')
  }

  const target = getMemberRepo().findById(targetMemberId)
  if (!target || target.workspaceId !== workspaceId) {
    throw new P2pPermissionError('成员不存在')
  }
  if (target.role === 'owner') {
    throw new P2pPermissionError('不能修改群主')
  }
  if (actor.role === 'admin' && target.role === 'admin') {
    throw new P2pPermissionError('管理员不能管理其他管理员')
  }

  return { actor, target }
}

export function assertCanManageSharedResource(
  workspaceId: string,
  sharedBy: string,
  opts?: { latestUploadedBy?: string },
): P2pWorkspaceMemberRow {
  const member = assertWorkspaceMemberAccess(workspaceId)
  if (!canWriteWorkspace(member.role)) {
    throw new P2pPermissionError('只读成员无法修改共享资源')
  }
  if (
    isWorkspaceAdmin(member.role) ||
    sharedBy === member.id ||
    (opts?.latestUploadedBy != null && opts.latestUploadedBy === member.id)
  ) {
    return member
  }
  throw new P2pPermissionError('无权修改该共享资源')
}

export function assertCanDeleteFile(
  workspaceId: string,
  sharedBy: string,
  latestUploadedBy?: string,
): P2pWorkspaceMemberRow {
  return assertCanManageSharedResource(workspaceId, sharedBy, { latestUploadedBy })
}

export function assertCanEditSharedResource(
  member: P2pWorkspaceMemberRow,
  resource: { permission: P2pSharedResourcePermission; sharedBy: string },
): void {
  if (!canWriteWorkspace(member.role)) {
    throw new P2pPermissionError('只读成员无法编辑')
  }
  if (isWorkspaceAdmin(member.role)) return
  if (resource.permission !== 'read') return
  if (resource.sharedBy === member.id) return
  throw new P2pPermissionError('只读资源无法编辑')
}

export function isWritableRole(role: P2pMemberRole): boolean {
  return canWriteWorkspace(role)
}
