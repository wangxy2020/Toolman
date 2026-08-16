/**
 * Personal (point-to-point) encrypted mailbox over LAN Sync Hub.
 * Carries sealed SyncChange batches between paired devices.
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
import { ToolmanSyncClient } from '@toolman/sync-client'
import { createMobileSyncClient, getMobileSyncBaseUrl, loadSyncHubToken } from './mobileSync-client'
import { loadDevicePairing } from '../storage/devicePairing'

const boundFetch: typeof fetch = (input, init) => globalThis.fetch.call(globalThis, input, init)

const mailboxSeqByWorkspace = new Map<string, number>()

export type PersonalMailboxPullResult = {
  transport: 'personal-mailbox'
  changes: SyncChange[]
  appliedFromDeviceId: string | null
}

export async function ensurePersonalMailboxSession(
  pairing: DevicePairingRecord,
): Promise<boolean> {
  try {
    // Prefer the Hub URL embedded in the pairing offer (desktop LAN address).
    const client = createMobileSyncClient(pairing.hubBaseUrlHint || getMobileSyncBaseUrl())
    await client.fetchMailboxSession({
      workspaceId: pairing.workspaceId,
      deviceId: pairing.localDeviceId,
      identityId: pairing.identityId,
    })
    return true
  } catch {
    return false
  }
}

export async function pullPersonalMailboxChanges(
  pairing?: DevicePairingRecord | null,
): Promise<PersonalMailboxPullResult | null> {
  const record = pairing ?? (await loadDevicePairing())
  if (!record) return null
  // Register with desktop when possible; put/pull use mailbox grant and no longer
  // require the LAN pairing token on the session route.
  await ensurePersonalMailboxSession(record)
  const workspaceKey = decodeWorkspaceKeyB64(record.workspaceKeyB64)
  const grant = await buildMailboxGrant({
    workspaceKey,
    workspaceId: record.workspaceId,
    deviceId: record.localDeviceId,
  })
  const client = new ToolmanSyncClient({
    baseUrl: record.hubBaseUrlHint || getMobileSyncBaseUrl(),
    getAccessToken: async () => null,
    getSyncToken: loadSyncHubToken,
    fetchImpl: boundFetch,
  })
  const sinceSeq = mailboxSeqByWorkspace.get(record.workspaceId) ?? 0
  const pulled = await client.pullMailbox({
    workspaceId: record.workspaceId,
    deviceId: record.localDeviceId,
    grant,
    sinceSeq,
    limit: 100,
  })
  const changes: SyncChange[] = []
  let lastSender: string | null = null
  let maxSeq = sinceSeq
  for (const envelope of pulled.envelopes ?? []) {
    maxSeq = Math.max(maxSeq, envelope.seq)
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
  if (maxSeq > sinceSeq) mailboxSeqByWorkspace.set(record.workspaceId, maxSeq)
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
  const client = new ToolmanSyncClient({
    baseUrl: input.pairing.hubBaseUrlHint || getMobileSyncBaseUrl(),
    getAccessToken: async () => null,
    getSyncToken: loadSyncHubToken,
    fetchImpl: boundFetch,
  })
  await client.putMailbox({
    workspaceId: input.pairing.workspaceId,
    deviceId: input.pairing.localDeviceId,
    recipientDeviceId: input.recipientDeviceId,
    grant,
    ciphertextB64,
  })
  return true
}
