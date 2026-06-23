import {
  GROUP_MAX_MEMBERS_PRO,
  PRO_MEMBERSHIP_ENTITLEMENTS,
  resolveGroupMaxMembers,
  type EntitlementContext,
} from '@toolman/shared'
import { getAuthSession } from '../auth-session.service'

export function getEntitlementContext(): EntitlementContext {
  const session = getAuthSession()
  return {
    subscriptionSku: session.subscriptionSku,
    entitlements: session.entitlements,
  }
}

export function resolveGroupMaxMembersForCurrentUser(): number {
  return resolveGroupMaxMembers(getEntitlementContext())
}

export function resolveWorkspaceMaxMembers(requested?: number): number {
  const allowed = resolveGroupMaxMembersForCurrentUser()
  if (requested == null) return allowed
  return Math.min(Math.max(1, requested), allowed)
}

export function getProMembershipEntitlements(): string[] {
  return [...PRO_MEMBERSHIP_ENTITLEMENTS]
}

export function getProGroupMaxMembers(): number {
  return GROUP_MAX_MEMBERS_PRO
}
