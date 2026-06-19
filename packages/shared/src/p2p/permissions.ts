import type { P2pMemberRole, P2pSharedResourcePermission } from './types.js'

export function isReadonlyMember(role: P2pMemberRole | undefined): boolean {
  return role === 'readonly'
}

export function canWriteWorkspace(role: P2pMemberRole | undefined): boolean {
  return role != null && role !== 'readonly'
}

export function canManageWorkspaceMembers(role: P2pMemberRole | undefined): boolean {
  return role === 'owner' || role === 'admin'
}

export function isWorkspaceAdmin(role: P2pMemberRole | undefined): boolean {
  return canManageWorkspaceMembers(role)
}

export function canManageSharedResource(
  role: P2pMemberRole | undefined,
  selfMemberId: string | null,
  sharedBy: string,
  opts?: { uploadedBy?: string },
): boolean {
  if (!canWriteWorkspace(role) || !selfMemberId) return false
  if (isWorkspaceAdmin(role)) return true
  if (sharedBy === selfMemberId) return true
  if (opts?.uploadedBy != null && opts.uploadedBy === selfMemberId) return true
  return false
}

export function canEditSharedResource(
  role: P2pMemberRole | undefined,
  selfMemberId: string | null,
  resource: { permission: P2pSharedResourcePermission; sharedBy: string },
): boolean {
  if (!canWriteWorkspace(role) || !selfMemberId) return false
  if (isWorkspaceAdmin(role)) return true
  if (resource.permission !== 'read') return true
  return resource.sharedBy === selfMemberId
}
