import {
  P2P_MAILBOX_PUT_PATH,
  decodeWorkspaceKeyB64,
  sealMailboxPlaintext,
  type P2pMailboxPlaintext,
  type P2pMailboxPropose,
  buildMailboxGrant,
} from '@toolman/shared'
import { recordP2pPathMetric } from './pathMetrics'
import {
  mailboxHubs,
  mailboxTargets,
  mailboxTimers,
  persistTarget,
  postJson,
  readPersistedTargets,
  type MailboxSyncTarget,
} from './mailboxSync-helpers'
import { pullMailboxOnce } from './mailboxSync-pull'

export async function putMailboxPlaintext(
  target: MailboxSyncTarget,
  plaintext: P2pMailboxPlaintext,
  recipientDeviceId: string,
  seq?: number,
  options?: { fanout?: boolean },
): Promise<void> {
  const grant = await buildMailboxGrant({
    workspaceKey: target.workspaceKey,
    workspaceId: target.workspaceId,
    deviceId: target.deviceId,
  })
  const ciphertextB64 = await sealMailboxPlaintext({
    workspaceKey: target.workspaceKey,
    workspaceId: target.workspaceId,
    plaintext,
  })
  const hubs = options?.fanout ? mailboxHubs(target.hubUrl) : [target.hubUrl]
  let stored = false
  let lastError: unknown
  for (const hubUrl of hubs) {
    try {
      await postJson(hubUrl, P2P_MAILBOX_PUT_PATH, {
        workspaceId: target.workspaceId,
        deviceId: target.deviceId,
        recipientDeviceId,
        grant,
        inviteToken: hubUrl === target.hubUrl ? target.inviteToken : undefined,
        ciphertextB64,
        seq,
      })
      stored = true
      if (!options?.fanout) break
    } catch (error) {
      lastError = error
    }
  }
  if (!stored) {
    throw lastError instanceof Error ? lastError : new Error('信箱投递失败')
  }
  recordP2pPathMetric('mailboxPut')
}

export async function putMailboxProposal(
  target: MailboxSyncTarget,
  proposal: P2pMailboxPropose,
): Promise<void> {
  if (!target.ownerDeviceId) throw new Error('缺少群主设备，无法投递信箱')
  await putMailboxPlaintext(
    target,
    { type: 'workspace.propose', proposal },
    target.ownerDeviceId,
    proposal.timestamp,
  )
}

export function startMailboxSync(target: MailboxSyncTarget): void {
  mailboxTargets.set(target.workspaceId, target)
  persistTarget(target)
  if (mailboxTimers.has(target.workspaceId)) return
  const tick = () => {
    void pullMailboxOnce(target).catch(() => undefined)
  }
  tick()
  mailboxTimers.set(target.workspaceId, setInterval(tick, 15_000))
}

export function resumePersistedMailboxSync(deviceId: string): void {
  for (const item of readPersistedTargets()) {
    if (mailboxTargets.has(item.workspaceId)) continue
    if (item.deviceId && item.deviceId !== deviceId) continue
    try {
      startMailboxSync({
        hubUrl: item.hubUrl,
        workspaceId: item.workspaceId,
        deviceId: item.deviceId || deviceId,
        workspaceKey: decodeWorkspaceKeyB64(item.workspaceKeyB64),
        inviteToken: item.inviteToken,
        ownerDeviceId: item.ownerDeviceId,
      })
    } catch {
      // stale key
    }
  }
}

export function getMailboxTarget(workspaceId: string): MailboxSyncTarget | undefined {
  return mailboxTargets.get(workspaceId)
}

export function patchMailboxOwnerDevice(
  workspaceId: string,
  ownerDeviceId: string,
): MailboxSyncTarget | undefined {
  const current = mailboxTargets.get(workspaceId)
  if (!current) return undefined
  if (current.ownerDeviceId === ownerDeviceId) return current
  const next = { ...current, ownerDeviceId }
  startMailboxSync(next)
  return next
}

export function stopMailboxSync(workspaceId: string): void {
  const timer = mailboxTimers.get(workspaceId)
  if (timer) clearInterval(timer)
  mailboxTimers.delete(workspaceId)
  mailboxTargets.delete(workspaceId)
}

export function stopAllMailboxSync(): void {
  for (const workspaceId of [...mailboxTimers.keys()]) stopMailboxSync(workspaceId)
  mailboxTargets.clear()
}
