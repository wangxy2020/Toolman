import { canManageWorkspaceMembers, type P2pMember, type P2pMemberRole } from '@toolman/shared'

export function canManageTargetMember(
  actorRole: P2pMemberRole | undefined,
  target: P2pMember,
  selfMemberId: string | null,
): boolean {
  if (!canManageWorkspaceMembers(actorRole)) return false
  if (target.id === selfMemberId) return false
  if (target.role === 'owner') return false
  if (actorRole === 'admin' && target.role === 'admin') return false
  return true
}

export function getAssignableRoles(
  actorRole: P2pMemberRole | undefined,
  target: P2pMember,
  selfMemberId: string | null,
): P2pMemberRole[] {
  if (!canManageTargetMember(actorRole, target, selfMemberId)) return []

  const roles: P2pMemberRole[] = ['member', 'readonly']
  if (actorRole === 'owner') {
    roles.unshift('admin')
  }
  return roles
}
