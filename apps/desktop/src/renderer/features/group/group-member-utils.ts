import { canManageWorkspaceMembers, type P2pMember, type P2pMemberRole } from '@toolman/shared'

export const MEMBER_ROLE_LABELS: Record<P2pMemberRole, string> = {
  owner: '群主',
  admin: '管理员',
  member: '成员',
  readonly: '只读',
}

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
