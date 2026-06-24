import { type CommunityUserRole } from '@toolman/shared'

export const USER_ROLE_LABELS: Record<CommunityUserRole, string> = {
  guest: '未注册',
  user: '普通用户',
  enterprise: 'VIP会员',
  admin: '管理员',
  founder: '超级管理员',
}

export function isCommunityModerator(role?: CommunityUserRole | null): boolean {
  return role === 'admin' || role === 'founder'
}

export function isCommunityFounder(role?: CommunityUserRole | null): boolean {
  return role === 'founder'
}

export function canDeleteCommunityComment(
  authorId: string,
  viewer?: { id: string; role?: CommunityUserRole | null } | null,
): boolean {
  if (!viewer) return false
  return viewer.id === authorId || isCommunityModerator(viewer.role)
}

export function canDeleteCommunityResource(
  ownerId: string,
  viewer?: { id: string; role?: CommunityUserRole | null } | null,
): boolean {
  if (!viewer) return false
  return viewer.id === ownerId || isCommunityModerator(viewer.role)
}

export const INSTALL_STATUS_LABELS: Record<
  'pending' | 'success' | 'failed' | 'rolled_back',
  string
> = {
  pending: '进行中',
  success: '成功',
  failed: '失败',
  rolled_back: '已回滚',
}
