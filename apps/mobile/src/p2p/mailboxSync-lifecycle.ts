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
  stopMailboxTarget,
  type MailboxSyncTarget,
} from './mailboxSync-helpers'
import { drainMailbox } from './mailboxSync-pull'
import { ignoreAsyncError } from './asyncFail'

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
        inviteToken: target.inviteToken,
        ciphertextB64,
        seq,
      })
      stored = true
      // Same owner hub is reachable as LAN + loopback; putting once is enough.
      break
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
    { fanout: true },
  )
}

export function rememberMailboxTarget(target: MailboxSyncTarget): void {
  mailboxTargets.set(target.workspaceId, target)
  persistTarget(target)
}

const mailboxPullInFlight = new Set<Promise<unknown>>()

export async function waitForMailboxPulls(): Promise<void> {
  await Promise.allSettled([...mailboxPullInFlight])
}

export function startMailboxSync(target: MailboxSyncTarget): void {
  rememberMailboxTarget(target)
  if (mailboxTimers.has(target.workspaceId)) return
  let ticking = false
  const tick = () => {
    const current = mailboxTargets.get(target.workspaceId)
    if (!current || ticking) return
    ticking = true
    const done = drainMailbox(current)
    mailboxPullInFlight.add(done)
    ignoreAsyncError(done, 'mailbox pull')
    void done.finally(() => {
      ticking = false
      mailboxPullInFlight.delete(done)
    })
  }
  mailboxTimers.set(target.workspaceId, setInterval(tick, 2_000))
  tick()
}

export function resumePersistedMailboxSync(deviceId: string): void {
  for (const item of readPersistedTargets()) {
    if (mailboxTimers.has(item.workspaceId)) continue
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

export function isMailboxSyncRunning(workspaceId: string): boolean {
  return mailboxTimers.has(workspaceId)
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
  stopMailboxTarget(workspaceId)
}

export function stopAllMailboxSync(): void {
  for (const workspaceId of [...mailboxTimers.keys()]) stopMailboxSync(workspaceId)
  mailboxTargets.clear()
}
