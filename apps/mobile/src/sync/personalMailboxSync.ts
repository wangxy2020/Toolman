/**
 * Personal (point-to-point) encrypted mailbox.
 * Carries sealed SyncChange batches between paired devices.
 * On hosted HTTPS, uses Community Hub / same-origin proxy — never LAN HTTP hints.
 */
import {
  SyncChangeSchema,
  buildMailboxGrant,
  decodeWorkspaceKeyB64,
  openMailboxPlaintext,
  sealMailboxPlaintext,
  type SyncChange,
  type DevicePairingRecord,
} from '@toolman/shared'
import { loadDevicePairing } from '../storage/devicePairing'
import {
  createPersonalMailboxClient,
  listPersonalMailboxBaseUrls,
  mailboxSeqKey,
} from './personalMailboxHubs'

const mailboxSeqByHub = new Map<string, number>()

export type PersonalMailboxPullResult = {
  transport: 'personal-mailbox'
  changes: SyncChange[]
  appliedFromDeviceId: string | null
}

export async function ensurePersonalMailboxSession(
  pairing: DevicePairingRecord,
): Promise<boolean> {
  for (const baseUrl of listPersonalMailboxBaseUrls(pairing)) {
    try {
      const client = createPersonalMailboxClient(baseUrl)
      await client.fetchMailboxSession({
        workspaceId: pairing.workspaceId,
        deviceId: pairing.localDeviceId,
        identityId: pairing.identityId,
      })
      return true
    } catch {
      // try next hub (Community Hub has no session route)
    }
  }
  return false
}

export async function pullPersonalMailboxChanges(
  pairing?: DevicePairingRecord | null,
): Promise<PersonalMailboxPullResult | null> {
  const record = pairing ?? (await loadDevicePairing())
  if (!record) return null
  await ensurePersonalMailboxSession(record)
  const workspaceKey = decodeWorkspaceKeyB64(record.workspaceKeyB64)
  const grant = await buildMailboxGrant({
    workspaceKey,
    workspaceId: record.workspaceId,
    deviceId: record.localDeviceId,
  })
  const changes: SyncChange[] = []
  let lastSender: string | null = null
  const seen = new Set<string>()
  let anyHub = false

  for (const baseUrl of listPersonalMailboxBaseUrls(record)) {
    const key = mailboxSeqKey(record.workspaceId, baseUrl)
    const sinceSeq = mailboxSeqByHub.get(key) ?? 0
    try {
      const client = createPersonalMailboxClient(baseUrl)
      const pulled = await client.pullMailbox({
        workspaceId: record.workspaceId,
        deviceId: record.localDeviceId,
        grant,
        sinceSeq,
        limit: 100,
      })
      anyHub = true
      let maxSeq = sinceSeq
      for (const envelope of pulled.envelopes ?? []) {
        maxSeq = Math.max(maxSeq, envelope.seq)
        const dedupe = `${envelope.seq}:${envelope.ciphertextB64}`
        if (seen.has(dedupe)) continue
        seen.add(dedupe)
        try {
          const plain = await openMailboxPlaintext({
            workspaceKey,
            workspaceId: record.workspaceId,
            ciphertextB64: envelope.ciphertextB64,
          })
          if (plain.type !== 'device.sync.changes') continue
          if (plain.senderDeviceId === record.localDeviceId) continue
          lastSender = plain.senderDeviceId
          for (const raw of plain.changes) {
            const parsed = SyncChangeSchema.safeParse(raw)
            if (parsed.success) changes.push(parsed.data)
          }
        } catch {
          // skip undecryptable
        }
      }
      if (maxSeq > sinceSeq) mailboxSeqByHub.set(key, maxSeq)
    } catch {
      // try next hub
    }
  }

  if (!anyHub && changes.length === 0) return null
  return { transport: 'personal-mailbox', changes, appliedFromDeviceId: lastSender }
}

export async function pushPersonalMailboxChanges(input: {
  pairing: DevicePairingRecord
  recipientDeviceId: string
  changes: SyncChange[]
}): Promise<boolean> {
  if (input.changes.length === 0) return true
  await ensurePersonalMailboxSession(input.pairing)
  const workspaceKey = decodeWorkspaceKeyB64(input.pairing.workspaceKeyB64)
  const grant = await buildMailboxGrant({
    workspaceKey,
    workspaceId: input.pairing.workspaceId,
    deviceId: input.pairing.localDeviceId,
  })
  const ciphertextB64 = await sealMailboxPlaintext({
    workspaceKey,
    workspaceId: input.pairing.workspaceId,
    plaintext: {
      type: 'device.sync.changes',
      senderDeviceId: input.pairing.localDeviceId,
      changes: input.changes,
      depositedAt: Date.now(),
    },
  })
  let deposited = false
  for (const baseUrl of listPersonalMailboxBaseUrls(input.pairing)) {
    try {
      const client = createPersonalMailboxClient(baseUrl)
      await client.putMailbox({
        workspaceId: input.pairing.workspaceId,
        deviceId: input.pairing.localDeviceId,
        recipientDeviceId: input.recipientDeviceId,
        grant,
        ciphertextB64,
      })
      deposited = true
    } catch {
      // try next hub
    }
  }
  return deposited
}
