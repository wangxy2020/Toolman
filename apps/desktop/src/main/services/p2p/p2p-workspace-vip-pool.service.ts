import { eq } from 'drizzle-orm'
import {
  P2pMemberRepository,
  P2pWorkspaceRepository,
  identities,
  type P2pWorkspaceMemberRow,
  type P2pWorkspaceRow,
} from '@toolman/db'
import type { EntitlementContext, ProductSku, WorkspaceEvent } from '@toolman/shared'
import { toErrorMessage } from '@toolman/shared'
import {GROUP_MAX_MEMBERS_PRO,
  GROUP_VIP_POOL_ACTIVATION_COUNT,
  formatVipPoolJoinRequiredMessage,
  isProSubscription,
  isWorkspaceVipPoolEnabled,
  mergeP2pWorkspaceSettings } from '@toolman/shared'
import { getDatabase } from '../../bootstrap/database'
import { getEntitlementContext } from '../auth/entitlement.service'
import { getP2pDeviceInfo } from './p2p-device-identity.service'
import { appendP2pEvent } from './p2p-event.service'

export class P2pMemberVipRequiredError extends Error {
  readonly code = 'P2P_MEMBER_VIP_REQUIRED' as const

  constructor(message = formatVipPoolJoinRequiredMessage()) {
    super(message)
    this.name = 'P2pMemberVipRequiredError'
  }
}

export interface P2pMemberCertSnapshot {
  subscriptionSku?: ProductSku | null
  entitlements?: string[]
  recordedAt?: number
}

function getMemberRepo(): P2pMemberRepository {
  return new P2pMemberRepository(getDatabase())
}

function getWorkspaceRepo(): P2pWorkspaceRepository {
  return new P2pWorkspaceRepository(getDatabase())
}

export function parseMemberCertSnapshot(certJson: string | null | undefined): P2pMemberCertSnapshot {
  if (!certJson?.trim()) return {}
  try {
    const parsed = JSON.parse(certJson) as P2pMemberCertSnapshot
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function buildMemberCertSnapshot(context: EntitlementContext = getEntitlementContext()): string {
  return JSON.stringify({
    subscriptionSku: context.subscriptionSku ?? 'community',
    entitlements: context.entitlements ?? [],
    recordedAt: Date.now(),
  } satisfies P2pMemberCertSnapshot)
}

export function getMemberEntitlementContext(member: P2pWorkspaceMemberRow): EntitlementContext {
  const identityRow = getDatabase()
    .select({ subscriptionSku: identities.subscriptionSku, entitlementsJson: identities.entitlementsJson })
    .from(identities)
    .where(eq(identities.id, member.identityId))
    .get()

  if (identityRow) {
    let entitlements: string[] = []
    try {
      entitlements = JSON.parse(identityRow.entitlementsJson) as string[]
    } catch {
      entitlements = []
    }
    return {
      subscriptionSku: identityRow.subscriptionSku,
      entitlements,
    }
  }

  const fromCert = parseMemberCertSnapshot(member.certJson)
  if (fromCert.subscriptionSku != null || fromCert.entitlements?.length) {
    return {
      subscriptionSku: fromCert.subscriptionSku ?? 'community',
      entitlements: fromCert.entitlements ?? [],
    }
  }
  return { subscriptionSku: 'community', entitlements: [] }
}

export function isMemberPro(member: P2pWorkspaceMemberRow): boolean {
  return isProSubscription(getMemberEntitlementContext(member))
}

export function assertJoinerEligibleForWorkspace(workspace: P2pWorkspaceRow): void {
  if (!isWorkspaceVipPoolEnabled(workspace.settingsJson)) {
    return
  }
  if (isProSubscription(getEntitlementContext())) {
    return
  }
  throw new P2pMemberVipRequiredError()
}

export function assertRemoteJoinerEligibleForWorkspace(
  workspace: P2pWorkspaceRow,
  joinerContext: EntitlementContext,
): void {
  if (!isWorkspaceVipPoolEnabled(workspace.settingsJson)) {
    return
  }
  if (isProSubscription(joinerContext)) {
    return
  }
  throw new P2pMemberVipRequiredError()
}

export function maybeActivateWorkspaceVipPool(workspaceId: string): boolean {
  const workspace = getWorkspaceRepo().findById(workspaceId)
  if (!workspace) return false

  const device = getP2pDeviceInfo()
  if (workspace.ownerDeviceId !== device.deviceId) {
    return false
  }

  if (isWorkspaceVipPoolEnabled(workspace.settingsJson)) {
    return false
  }

  if (workspace.maxMembers > GROUP_VIP_POOL_ACTIVATION_COUNT) {
    return false
  }

  const activeMembers = getMemberRepo().listByWorkspace(workspaceId, 'active')
  if (activeMembers.length !== GROUP_VIP_POOL_ACTIVATION_COUNT) {
    return false
  }

  if (!activeMembers.every((member) => isMemberPro(member))) {
    return false
  }

  const ownerMember =
    activeMembers.find((member) => member.deviceId === workspace.ownerDeviceId) ??
    activeMembers[0]
  if (!ownerMember) return false

  const updated = getWorkspaceRepo().update({
    id: workspaceId,
    maxMembers: GROUP_MAX_MEMBERS_PRO,
    settingsJson: mergeP2pWorkspaceSettings(workspace.settingsJson, { vipPoolEnabled: true }),
  })
  if (!updated) return false

  void appendP2pEvent({
    workspaceId,
    resourceType: 'Workspace',
    resourceId: workspaceId,
    operatorId: ownerMember.id,
    eventType: 'Updated',
    payload: {
      max_members: GROUP_MAX_MEMBERS_PRO,
      vip_pool_enabled: true,
    },
  }).catch((error) => {
    const message = toErrorMessage(error, String(error))
    console.warn(`[p2p] vip pool workspace event append failed: ${message}`)
  })

  return true
}

export function refreshOwnedWorkspaceVipPools(): void {
  const device = getP2pDeviceInfo()
  const workspaces = getWorkspaceRepo().listByOwnerDevice(device.deviceId)
  for (const workspace of workspaces) {
    maybeActivateWorkspaceVipPool(workspace.id)
  }
}

export function entitlementContextFromJoinerSku(
  subscriptionSku?: ProductSku | null,
): EntitlementContext {
  if (subscriptionSku === 'pro') {
    return { subscriptionSku: 'pro', entitlements: [] }
  }
  return { subscriptionSku: subscriptionSku ?? 'community', entitlements: [] }
}

export function projectWorkspaceUpdatedFromEvent(event: WorkspaceEvent): void {
  if (event.resourceType !== 'Workspace' || event.eventType !== 'Updated') {
    return
  }

  const workspace = getWorkspaceRepo().findById(event.workspaceId)
  if (!workspace) return

  const rawMaxMembers = event.payload.max_members
  const rawVipPool = event.payload.vip_pool_enabled
  const maxMembers = typeof rawMaxMembers === 'number' ? Math.floor(rawMaxMembers) : undefined
  const vipPoolEnabled = rawVipPool === true

  if (maxMembers == null && !vipPoolEnabled) {
    return
  }

  getWorkspaceRepo().update({
    id: event.workspaceId,
    maxMembers,
    settingsJson: vipPoolEnabled
      ? mergeP2pWorkspaceSettings(workspace.settingsJson, { vipPoolEnabled: true })
      : undefined,
  })
}
