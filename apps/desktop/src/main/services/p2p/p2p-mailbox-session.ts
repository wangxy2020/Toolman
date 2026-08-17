import { randomUUID } from 'node:crypto'
import {
  P2pMailboxSessionInputSchema,
  canForwardWorkspaceAsGateway,
  inferMemberDeviceKind,
  isUsableMemberIdentityId,
  openMailboxPlaintext,
  parseP2pClientDeviceKind,
  preferMemberDisplayName,
  sealMailboxPlaintext,
  workspaceKeyFromB64,
  type P2pClientDeviceKind,
  type WorkspaceEvent,
} from '@toolman/shared'
import { toErrorMessage } from '@toolman/shared'
import { logStructured } from '../structured-log.service'
import { getP2pDeviceInfo } from './p2p-device-identity.service'
import {
  findIdentitySibling,
  getMemberRepo,
  getWorkspaceRepo,
  listWorkspaceMemberRoster,
  membershipFromIdentitySibling,
  toWorkspaceDto,
  touchMemberLastSeen,
} from './p2p-member-shared'
import { publishP2pGroupSyncChange } from '../group-mobile-sync'
import { loadWorkspaceKey } from './p2p-workspace-key.store'
import { putMailboxRecord } from './p2p-mailbox-store'
import {
  depositCiphertextToCommunityMailbox,
  pullCommunityMailboxEnvelopes,
} from './p2p-mailbox-remote'
import { listActiveAgentShareListings } from './p2p-agent-share-listing'
import { workspaceEventToWire } from './p2p-sync-protocol'
import { logP2pPathMetrics, recordP2pPathMetric } from './p2p-path-metrics'
import { memberVisible } from './p2p-mailbox-auth'
import { applyIncomingMailbox } from './p2p-mailbox-handlers'
import { resolvePersonalMailboxSession } from '../personal-device-pairing.service'

function certJsonWithDeviceKind(
  existing: string | null | undefined,
  kind: P2pClientDeviceKind,
): string {
  try {
    const parsed = existing?.trim() ? (JSON.parse(existing) as Record<string, unknown>) : {}
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return JSON.stringify({ ...parsed, deviceKind: kind })
    }
  } catch {
    /* ignore */
  }
  return JSON.stringify({ deviceKind: kind })
}

export async function depositEventToMailbox(event: WorkspaceEvent): Promise<void> {
  const local = getP2pDeviceInfo()
  if (!canForwardWorkspaceAsGateway(memberVisible(event.workspaceId, local.deviceId))) {
    return
  }
  const keyB64 = loadWorkspaceKey(event.workspaceId)
  if (!keyB64) return
  const workspaceKey = workspaceKeyFromB64(keyB64)
  const members = getMemberRepo()
    .listByWorkspace(event.workspaceId)
    .filter(
      (member) =>
        (member.status === 'active' || member.status === 'invited') &&
        member.deviceId !== local.deviceId,
    )
  const ciphertextB64 = await sealMailboxPlaintext({
    workspaceKey,
    workspaceId: event.workspaceId,
    plaintext: { type: 'workspace.event', event: workspaceEventToWire(event) },
  })
  for (const member of members) {
    putMailboxRecord({
      workspaceId: event.workspaceId,
      recipientDeviceId: member.deviceId,
      seq: event.seq,
      ciphertextB64,
      depositedAt: Date.now(),
    })
    void depositCiphertextToCommunityMailbox({
      workspaceId: event.workspaceId,
      senderDeviceId: local.deviceId,
      recipientDeviceId: member.deviceId,
      workspaceKey,
      ciphertextB64,
      seq: event.seq,
    })
  }
  if (members.length > 0) {
    recordP2pPathMetric('mailboxPut')
    logStructured('p2p', 'info', `mailbox deposited seq=${event.seq} recipients=${members.length}`)
    logP2pPathMetrics()
  }
}

export async function handleMailboxSession(
  raw: unknown,
): Promise<
  | {
      ok: true
      data: {
        ok: true
        workspaceId: string
        ownerDeviceId: string
        ownerIdentityId?: string
        workspaceKeyB64: string
        members?: ReturnType<typeof listWorkspaceMemberRoster>
        sharedAgents?: ReturnType<typeof listActiveAgentShareListings>
      }
    }
  | { ok: false; status: number; error: string }
> {
  const parsed = P2pMailboxSessionInputSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, status: 400, error: '信箱会话参数无效' }
  const input = parsed.data
  const personal = resolvePersonalMailboxSession({
    workspaceId: input.workspaceId,
    deviceId: input.deviceId,
    identityId: input.identityId,
  })
  if (personal) return personal
  const workspace = getWorkspaceRepo().findById(input.workspaceId)
  if (!workspace) return { ok: false, status: 404, error: '群组不存在' }
  const keyB64 = loadWorkspaceKey(input.workspaceId)
  if (!keyB64) return { ok: false, status: 404, error: '群组密钥不可用' }

  const existing = getMemberRepo().findByWorkspaceAndDevice(input.workspaceId, input.deviceId)
  const requestedIdentity = input.identityId?.trim() || ''
  const sibling = requestedIdentity
    ? findIdentitySibling(input.workspaceId, requestedIdentity, input.deviceId)
    : null
  const samePerson = Boolean(sibling && sibling.identityId === requestedIdentity)
  if (!existing && !samePerson) {
    return { ok: false, status: 403, error: '不是该群成员' }
  }
  if (!existing && sibling && samePerson) {
    const inherited = membershipFromIdentitySibling(sibling.role, sibling)
    const kind = inferMemberDeviceKind(input.deviceId, parseP2pClientDeviceKind(input.deviceKind))
    getMemberRepo().create({
      id: randomUUID(),
      workspaceId: input.workspaceId,
      identityId: sibling.identityId,
      deviceId: input.deviceId,
      displayName:
        preferMemberDisplayName(input.displayName, sibling.displayName) || sibling.displayName,
      role: inherited.role,
      status: inherited.status,
      certJson: JSON.stringify({ deviceKind: kind }),
    })
    publishP2pGroupSyncChange(toWorkspaceDto(workspace))
    logStructured(
      'p2p',
      'info',
      `mailbox session added same-identity device ${input.deviceId} to ${input.workspaceId}`,
    )
  } else if (existing) {
    const requestedKind = parseP2pClientDeviceKind(input.deviceKind)
    const nextName = preferMemberDisplayName(input.displayName, existing.displayName)
    const nextCert = requestedKind
      ? certJsonWithDeviceKind(existing.certJson, requestedKind)
      : undefined
    const rebindIdentity = Boolean(
      requestedIdentity &&
        isUsableMemberIdentityId(requestedIdentity) &&
        existing.identityId !== requestedIdentity &&
        !isUsableMemberIdentityId(existing.identityId),
    )
    const patch: {
      id: string
      identityId?: string
      displayName?: string
      certJson?: string
    } = { id: existing.id }
    if (rebindIdentity) patch.identityId = requestedIdentity
    if (nextName && nextName !== existing.displayName) patch.displayName = nextName
    if (nextCert && nextCert !== existing.certJson) patch.certJson = nextCert
    if (patch.identityId || patch.displayName || patch.certJson) {
      getMemberRepo().update(patch)
      publishP2pGroupSyncChange(toWorkspaceDto(workspace))
    }
  }

  touchMemberLastSeen(input.workspaceId, input.deviceId)
  let sharedAgents: ReturnType<typeof listActiveAgentShareListings> = []
  try {
    sharedAgents = listActiveAgentShareListings(input.workspaceId)
  } catch (error) {
    logStructured(
      'p2p',
      'warn',
      `mailbox session shared agent listing failed: ${toErrorMessage(error, String(error))}`,
    )
  }
  return {
    ok: true,
    data: {
      ok: true,
      workspaceId: input.workspaceId,
      ownerDeviceId: workspace.ownerDeviceId,
      ownerIdentityId: workspace.ownerIdentityId,
      workspaceKeyB64: keyB64,
      members: listWorkspaceMemberRoster(input.workspaceId),
      sharedAgents,
    },
  }
}

const communityPullSince = new Map<string, number>()
let communityPullTimer: ReturnType<typeof setInterval> | null = null

export async function pullAndApplyCommunityMailbox(): Promise<void> {
  const local = getP2pDeviceInfo()
  const workspaces = getWorkspaceRepo().listByOwnerDevice(local.deviceId)
  for (const workspace of workspaces) {
    const keyB64 = loadWorkspaceKey(workspace.id)
    if (!keyB64) continue
    const sinceSeq = communityPullSince.get(workspace.id) ?? 0
    const envelopes = await pullCommunityMailboxEnvelopes({
      workspaceId: workspace.id,
      deviceId: local.deviceId,
      workspaceKey: workspaceKeyFromB64(keyB64),
      sinceSeq,
    })
    for (const envelope of envelopes) {
      try {
        const plaintext = await openMailboxPlaintext({
          workspaceKey: workspaceKeyFromB64(keyB64),
          workspaceId: workspace.id,
          ciphertextB64: envelope.ciphertextB64,
        })
        await applyIncomingMailbox(workspace.id, plaintext)
        communityPullSince.set(workspace.id, Math.max(sinceSeq, envelope.seq))
      } catch (error) {
        logStructured(
          'p2p',
          'warn',
          `community mailbox apply failed: ${toErrorMessage(error, String(error))}`,
        )
      }
    }
  }
}

export function startCommunityMailboxPull(): void {
  if (communityPullTimer) return
  const tick = () => {
    void pullAndApplyCommunityMailbox().catch((error) => {
      logStructured(
        'p2p',
        'warn',
        `community mailbox pull failed: ${toErrorMessage(error, String(error))}`,
      )
    })
  }
  tick()
  communityPullTimer = setInterval(tick, 2_000)
}
