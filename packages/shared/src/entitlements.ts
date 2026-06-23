import type { ProductSku } from './ipc/auth.js'

export const ENTITLEMENT_GROUP_MAX_MEMBERS = 'group.max_members'
export const ENTITLEMENT_COMMUNITY_WRITE = 'community.write'

export const GROUP_MAX_MEMBERS_COMMUNITY = 10
export const GROUP_MAX_MEMBERS_PRO = 50
export const GROUP_MAX_MEMBERS_ABSOLUTE_MAX = 50
/** 已有群组升级为会员专属群所需的活跃成员数 */
export const GROUP_VIP_POOL_ACTIVATION_COUNT = 10

export interface EntitlementContext {
  subscriptionSku?: ProductSku | null
  entitlements?: string[]
}

export function parseEntitlementValue(
  entitlements: string[] | undefined,
  key: string,
): number | null {
  if (!entitlements?.length) return null

  for (const entry of entitlements) {
    const trimmed = entry.trim()
    if (!trimmed) continue

    const [entryKey, rawValue] = trimmed.split(':', 2)
    if (entryKey?.trim() !== key) continue

    const parsed = Number(rawValue?.trim())
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed)
    }
  }

  return null
}

export function resolveGroupMaxMembers(context: EntitlementContext): number {
  const fromEntitlement = parseEntitlementValue(
    context.entitlements,
    ENTITLEMENT_GROUP_MAX_MEMBERS,
  )
  if (fromEntitlement != null) {
    return Math.min(fromEntitlement, GROUP_MAX_MEMBERS_ABSOLUTE_MAX)
  }

  if (context.subscriptionSku === 'pro') {
    return GROUP_MAX_MEMBERS_PRO
  }

  return GROUP_MAX_MEMBERS_COMMUNITY
}

export function isProSubscription(context: EntitlementContext): boolean {
  if (context.subscriptionSku === 'pro') return true
  const maxMembers = resolveGroupMaxMembers(context)
  return maxMembers > GROUP_MAX_MEMBERS_COMMUNITY
}

export function shouldWarnGroupMemberLimit(
  context: EntitlementContext,
  activeMemberCount: number,
  workspaceMaxMembers: number,
): boolean {
  if (isProSubscription(context)) return false
  if (workspaceMaxMembers <= GROUP_MAX_MEMBERS_COMMUNITY) {
    return activeMemberCount === workspaceMaxMembers - 1
  }
  return false
}

export function formatGroupMemberLimitMessage(maxMembers: number): string {
  return `社区版群组人数已达上限（${maxMembers} 人）。请开通会员服务以提升群组成员上限。`
}

export function formatVipPoolJoinRequiredMessage(): string {
  return '该群组已升级为会员专属群，仅专业版会员可以加入。'
}

export const PRO_MEMBERSHIP_ENTITLEMENTS = [
  ENTITLEMENT_COMMUNITY_WRITE,
  `${ENTITLEMENT_GROUP_MAX_MEMBERS}:${GROUP_MAX_MEMBERS_PRO}`,
] as const
