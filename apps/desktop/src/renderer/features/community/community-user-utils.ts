import { type CommunityUserRole } from '@toolman/shared'

export const USER_ROLE_LABELS: Record<CommunityUserRole, string> = {
  guest: '访客',
  user: '用户',
  enterprise: '企业',
  admin: '管理员',
  founder: '创始人',
}

export function isCommunityModerator(role?: CommunityUserRole | null): boolean {
  return role === 'admin' || role === 'founder'
}

export function isCommunityFounder(role?: CommunityUserRole | null): boolean {
  return role === 'founder'
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
