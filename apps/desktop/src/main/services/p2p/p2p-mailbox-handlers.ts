import {
  P2pMailboxPullInputSchema,
  P2pMailboxPutInputSchema,
  admitMailboxProposal,
  canWriteWorkspace,
  openMailboxPlaintext,
  workspaceKeyFromB64,
  type P2pMailboxPlaintext,
} from '@toolman/shared'
import { toErrorMessage } from '@toolman/shared'
import { logStructured } from '../structured-log.service'
import { applyRemoteP2pEvent } from './p2p-event-remote'
import { appendP2pEventLocally } from './p2p-event.service'
import { getP2pDeviceInfo } from './p2p-device-identity.service'
import {
  getMemberRepo,
  getWorkspaceRepo,
  listWorkspaceMemberRoster,
  touchMemberLastSeen,
} from './p2p-member-shared'
import { loadWorkspaceKey } from './p2p-workspace-key.store'
import { isLocalWorkspaceOwner } from './p2p-sync-sequencing'
import { putMailboxRecord, pullMailboxRecords } from './p2p-mailbox-store'
import { listActiveAgentShareListings } from './p2p-agent-share-listing'
import { checkReplayGuard } from './p2p-replay-guard.service'
import { recordP2pPathMetric } from './p2p-path-metrics'
import { authorizeMailbox, memberVisible, proposalReplayHash } from './p2p-mailbox-auth'
import { authorizeMemberManagementProposal, isMemberManagementProposal } from './p2p-member-manage-proposal'

export async function applyIncomingMailbox(
  workspaceId: string,
  plaintext: P2pMailboxPlaintext,
): Promise<void> {
  if (plaintext.type === 'workspace.event') {
    const event = plaintext.event
    if (event.workspaceId !== workspaceId) return
    applyRemoteP2pEvent({
      eventId: event.eventId,
      workspaceId: event.workspaceId,
      seq: event.seq,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      operatorId: event.operatorId,
      eventType: event.eventType,
      payload: JSON.parse(event.payloadJson) as Record<string, unknown>,
      timestamp: event.timestamp,
      sourceDeviceId: event.sourceDeviceId,
    })
    return
  }
  if (plaintext.type === 'agent-relay.message') {
    if (!memberVisible(workspaceId, plaintext.senderDeviceId)) {
      logStructured('p2p', 'warn', 'mailbox agent-relay rejected: sender not a member')
      return
    }
    const requestId =
      plaintext.relay &&
      typeof plaintext.relay === 'object' &&
      'requestId' in plaintext.relay &&
      typeof plaintext.relay.requestId === 'string'
        ? plaintext.relay.requestId
        : ''
    if (requestId) {
      const { rememberRelayMailboxPeer } = await import('./p2p-agent-relay/mailbox-deposit')
      rememberRelayMailboxPeer(requestId, workspaceId, plaintext.senderDeviceId, true)
    }
    logStructured(
      'p2p',
      'info',
      `mailbox agent-relay received from=${plaintext.senderDeviceId} requestId=${requestId || 'unknown'}`,
    )
    const { handleP2pAgentRelayMessage } = await import('./p2p-agent-relay/handler')
    await handleP2pAgentRelayMessage(
      plaintext.senderDeviceId,
      Buffer.from(JSON.stringify(plaintext.relay), 'utf8'),
    )
    return
  }
  // Personal device-sync envelopes are handled by personal mailbox / WebRTC paths.
  if (plaintext.type === 'device.sync.changes' || plaintext.type === 'device.sync.signal') {
    return
  }
  if (plaintext.type !== 'workspace.propose') return
  if (!isLocalWorkspaceOwner(workspaceId)) return
  const sender = getMemberRepo().findByWorkspaceAndDevice(
    workspaceId,
    plaintext.proposal.sourceDeviceId,
  )
  const replay = checkReplayGuard({
    scope: 'mailbox.propose',
    signerId: plaintext.proposal.sourceDeviceId,
    at: plaintext.proposal.timestamp,
    payloadHash: proposalReplayHash(plaintext.proposal),
    requireFresh: false,
  })
  const admitted = admitMailboxProposal({
    senderCanWrite: Boolean(
      sender &&
        (sender.status === 'active' || sender.status === 'invited') &&
        canWriteWorkspace(sender.role),
    ),
    duplicate: !replay.ok,
  })
  if (!admitted.ok) {
    logStructured('p2p', 'warn', `mailbox propose rejected: ${admitted.reason}`)
    return
  }
  if (isMemberManagementProposal(plaintext.proposal)) {
    const authorized = authorizeMemberManagementProposal({
      workspaceId,
      senderDeviceId: plaintext.proposal.sourceDeviceId,
      resourceId: plaintext.proposal.resourceId,
      eventType: plaintext.proposal.eventType,
      payload: plaintext.proposal.payload,
    })
    if (!authorized.ok) {
      logStructured('p2p', 'warn', `mailbox member management rejected: ${authorized.reason}`)
      return
    }
  }
  await appendP2pEventLocally({
    workspaceId,
    resourceType: plaintext.proposal.resourceType,
    resourceId: plaintext.proposal.resourceId,
    operatorId: plaintext.proposal.operatorId,
    eventType: plaintext.proposal.eventType,
    payload: plaintext.proposal.payload,
    timestamp: plaintext.proposal.timestamp,
  })
}

export async function handleMailboxPut(
  raw: unknown,
): Promise<{ ok: true; data: { ok: true; stored: boolean } } | { ok: false; status: number; error: string }> {
  const parsed = P2pMailboxPutInputSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, status: 400, error: '信箱投递参数无效' }
  const input = parsed.data
  const auth = await authorizeMailbox(input)
  if (!auth.ok) return auth
  if (!memberVisible(input.workspaceId, input.recipientDeviceId)) {
    return { ok: false, status: 403, error: '收件设备不是该群成员' }
  }

  const seq = input.seq ?? Date.now()
  putMailboxRecord({
    workspaceId: input.workspaceId,
    recipientDeviceId: input.recipientDeviceId,
    seq,
    ciphertextB64: input.ciphertextB64,
    depositedAt: Date.now(),
  })
  recordP2pPathMetric('mailboxPut')
  touchMemberLastSeen(input.workspaceId, input.deviceId)
  logStructured(
    'p2p',
    'info',
    `mailbox put ws=${input.workspaceId} seq=${seq} recipient=${input.recipientDeviceId}`,
  )

  const local = getP2pDeviceInfo()
  if (input.recipientDeviceId === local.deviceId) {
    try {
      const keyB64 = loadWorkspaceKey(input.workspaceId)
      if (keyB64) {
        const plaintext = await openMailboxPlaintext({
          workspaceKey: workspaceKeyFromB64(keyB64),
          workspaceId: input.workspaceId,
          ciphertextB64: input.ciphertextB64,
        })
        await applyIncomingMailbox(input.workspaceId, plaintext)
        recordP2pPathMetric('mailboxPullApplied')
      }
    } catch (error) {
      logStructured('p2p', 'warn', `mailbox local apply failed: ${toErrorMessage(error, String(error))}`)
    }
  }

  return { ok: true, data: { ok: true, stored: true } }
}

export async function handleMailboxPull(
  raw: unknown,
): Promise<
  | {
      ok: true
      data: {
        ok: true
        envelopes: ReturnType<typeof pullMailboxRecords>
        members?: ReturnType<typeof listWorkspaceMemberRoster>
        ownerIdentityId?: string
        ownerDeviceId?: string
        sharedAgents?: ReturnType<typeof listActiveAgentShareListings>
      }
    }
  | { ok: false; status: number; error: string }
> {
  const parsed = P2pMailboxPullInputSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, status: 400, error: '信箱拉取参数无效' }
  const input = parsed.data
  const auth = await authorizeMailbox(input)
  if (!auth.ok) return auth
  const envelopes = pullMailboxRecords({
    workspaceId: input.workspaceId,
    recipientDeviceId: input.deviceId,
    sinceSeq: input.sinceSeq,
    limit: input.limit,
  })
  touchMemberLastSeen(input.workspaceId, input.deviceId)
  const workspace = getWorkspaceRepo().findById(input.workspaceId)
  let sharedAgents: ReturnType<typeof listActiveAgentShareListings> = []
  try {
    sharedAgents = listActiveAgentShareListings(input.workspaceId)
  } catch (error) {
    logStructured(
      'p2p',
      'warn',
      `mailbox shared agent listing failed: ${toErrorMessage(error, String(error))}`,
    )
  }
  return {
    ok: true,
    data: {
      ok: true,
      envelopes,
      members: listWorkspaceMemberRoster(input.workspaceId),
      ownerIdentityId: workspace?.ownerIdentityId,
      ownerDeviceId: workspace?.ownerDeviceId,
      sharedAgents,
    },
  }
}

