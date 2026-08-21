import {
  P2P_MAILBOX_PULL_PATH,
  P2pMailboxPullOutputSchema,
  buildMailboxGrant,
  openMailboxPlaintext,
} from '@toolman/shared'
import { applyAgentShareListings } from './agentShareListing'
import { applyWorkspaceWireEvents } from './groupChatMesh'
import { emitMeshEvent } from './meshEvents'
import { rosterMemberFromSync } from '../sync/groupSyncMerge'
import { recordP2pPathMetric } from './pathMetrics'
import {
  MAILBOX_PULL_LIMIT,
  forgetMailboxTarget,
  hubLooksLikeOwnerDesktop,
  isMailboxMissingGroupError,
  mailboxHubs,
  readMailboxSeq,
  rememberMailboxSeq,
  tryPostJson,
  type MailboxSyncTarget,
} from './mailboxSync-helpers'

export async function pullMailboxOnce(target: MailboxSyncTarget): Promise<number> {
  const started = Date.now()
  const grant = await buildMailboxGrant({
    workspaceKey: target.workspaceKey,
    workspaceId: target.workspaceId,
    deviceId: target.deviceId,
  })
  let lastError: unknown
  let sawMissingGroup = false
  let sawOtherError = false
  let applied = 0
  let pulledEnvelopes = false
  let appliedListings = false
  let hasMore = false
  const seenEnvelopes = new Set<string>()
  for (const hubUrl of mailboxHubs(target.hubUrl)) {
    try {
      const posted = await tryPostJson(hubUrl, P2P_MAILBOX_PULL_PATH, {
        workspaceId: target.workspaceId,
        deviceId: target.deviceId,
        grant,
        inviteToken: target.inviteToken,
        sinceSeq: readMailboxSeq(target.workspaceId, hubUrl),
        limit: MAILBOX_PULL_LIMIT,
      })
      if (!posted.ok) {
        lastError = new Error(posted.error)
        if (posted.status === 404 && isMailboxMissingGroupError(posted.error)) {
          sawMissingGroup = true
        } else {
          sawOtherError = true
        }
        continue
      }
      const raw = posted.data
      const parsed = P2pMailboxPullOutputSchema.safeParse(raw)
      if (!parsed.success) continue
      let hubMaxSeq = readMailboxSeq(target.workspaceId, hubUrl)
      if (parsed.data.envelopes.length >= MAILBOX_PULL_LIMIT) hasMore = true
      for (const envelope of parsed.data.envelopes) {
        const seenKey = `${hubUrl}:${envelope.seq}:${envelope.ciphertextB64}`
        if (seenEnvelopes.has(seenKey)) continue
        seenEnvelopes.add(seenKey)
        if (envelope.seq > hubMaxSeq) hubMaxSeq = envelope.seq
        try {
          const plaintext = await openMailboxPlaintext({
            workspaceKey: target.workspaceKey,
            workspaceId: target.workspaceId,
            ciphertextB64: envelope.ciphertextB64,
          })
          if (plaintext.type === 'workspace.event') {
            if (plaintext.event.resourceType !== 'Agent') {
              applied += applyWorkspaceWireEvents(target.workspaceId, [plaintext.event])
            }
          } else if (plaintext.type === 'agent-relay.message') {
            const { handleIncomingAgentRelay } = await import('./agentRelay')
            handleIncomingAgentRelay(plaintext.relay)
            applied += 1
          }
        } catch {
          // stale or foreign envelope; still advance the cursor
        }
      }
      rememberMailboxSeq(target.workspaceId, hubUrl, hubMaxSeq)
      pulledEnvelopes = true
      if (!appliedListings && parsed.data.sharedAgents !== undefined) {
        applyAgentShareListings(target.workspaceId, parsed.data.sharedAgents)
        applied += parsed.data.sharedAgents.length
        appliedListings = true
      }
      if (parsed.data.members && parsed.data.members.length > 0) {
        emitMeshEvent({
          type: 'roster',
          workspaceId: target.workspaceId,
          members: parsed.data.members.map((member) => rosterMemberFromSync(member)),
          ownerIdentityId: parsed.data.ownerIdentityId,
          ownerDeviceId: parsed.data.ownerDeviceId ?? target.ownerDeviceId,
        })
      } else if (target.ownerDeviceId && hubLooksLikeOwnerDesktop(hubUrl)) {
        emitMeshEvent({
          type: 'presence',
          workspaceId: target.workspaceId,
          deviceId: target.ownerDeviceId,
          online: true,
        })
      }
      if (pulledEnvelopes) break
    } catch (error) {
      lastError = error
      sawOtherError = true
    }
  }
  if (applied > 0) {
    recordP2pPathMetric('mailboxPullApplied', Date.now() - started)
  }
  if (!pulledEnvelopes && sawMissingGroup && !sawOtherError) {
    forgetMailboxTarget(target.workspaceId)
    return 0
  }
  if (!pulledEnvelopes && lastError) throw lastError
  return hasMore ? Math.max(applied, MAILBOX_PULL_LIMIT) : applied
}

export async function drainMailbox(target: MailboxSyncTarget): Promise<number> {
  let total = 0
  for (let i = 0; i < 8; i++) {
    const applied = await pullMailboxOnce(target)
    total += applied
    if (applied < MAILBOX_PULL_LIMIT) break
  }
  return total
}
