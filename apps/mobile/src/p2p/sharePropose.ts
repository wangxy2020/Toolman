import type { P2pEventType, P2pResourceType } from '@toolman/shared'
import { newUuid } from './bytes'
import { encodeReplicationMessage } from './meshCodec'
import { getMailboxTarget, putMailboxProposal } from './mailboxSync'
import { sendEventsJson } from './session'

type PendingPropose = {
  resolve: (ok: boolean, reason?: string) => void
  timer: ReturnType<typeof setTimeout>
}

const pending = new Map<string, PendingPropose>()
const outbox: Array<{ workspaceId: string; json: string }> = []
const PROPOSE_TIMEOUT_MS = 20_000

export function resolveSharePropose(proposalId: string, ok: boolean, reason?: string): void {
  const item = pending.get(proposalId)
  if (!item) return
  clearTimeout(item.timer)
  pending.delete(proposalId)
  item.resolve(ok, reason)
}

export async function flushShareProposeOutbox(workspaceId: string): Promise<void> {
  const pendingItems = outbox.filter((item) => item.workspaceId === workspaceId)
  for (const item of pendingItems) {
    try {
      await sendEventsJson(item.workspaceId, item.json)
      const index = outbox.indexOf(item)
      if (index >= 0) outbox.splice(index, 1)
    } catch {
      // keep for next handshake
    }
  }
}

export async function proposeWorkspaceEvent(input: {
  workspaceId: string
  resourceType: P2pResourceType
  resourceId: string
  operatorId: string
  eventType: P2pEventType
  payload: Record<string, unknown>
  sourceDeviceId: string
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const proposalId = newUuid()
  const json = encodeReplicationMessage({
    type: 'events.propose',
    workspaceId: input.workspaceId,
    proposalId,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    operatorId: input.operatorId,
    eventType: input.eventType,
    payloadJson: JSON.stringify(input.payload),
    sourceDeviceId: input.sourceDeviceId,
    timestamp: Date.now(),
  })

  const wait = new Promise<{ ok: true } | { ok: false; message: string }>((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(proposalId)
      resolve({ ok: false, message: '向群主提交共享超时' })
    }, PROPOSE_TIMEOUT_MS)
    pending.set(proposalId, {
      timer,
      resolve: (ok, reason) => {
        resolve(ok ? { ok: true } : { ok: false, message: reason || '群主拒绝了共享' })
      },
    })
  })

  try {
    await sendEventsJson(input.workspaceId, json)
  } catch {
    const mailbox = getMailboxTarget(input.workspaceId)
    if (mailbox) {
      try {
        await putMailboxProposal(mailbox, {
          resourceType: input.resourceType,
          resourceId: input.resourceId,
          operatorId: input.operatorId,
          eventType: input.eventType,
          payload: input.payload,
          sourceDeviceId: input.sourceDeviceId,
          timestamp: Date.now(),
        })
        const item = pending.get(proposalId)
        if (item) {
          clearTimeout(item.timer)
          pending.delete(proposalId)
        }
        return { ok: true }
      } catch {
        // fall through to outbox
      }
    }
    outbox.push({ workspaceId: input.workspaceId, json })
    const item = pending.get(proposalId)
    if (item) {
      clearTimeout(item.timer)
      pending.delete(proposalId)
    }
    return { ok: false, message: '直连未就绪，已加入待发送队列' }
  }

  return wait
}
