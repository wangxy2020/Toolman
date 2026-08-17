/**
 * Answer personal device-sync WebRTC offers deposited into the local Sync Hub mailbox,
 * then push recent SyncChange batches over the native `device-sync` channel.
 * Also applies inbound `device.sync.changes` from the encrypted personal mailbox.
 * Signaling/mailbox stay on the desktop Sync Hub (P2P) — no official Hub.
 */
import {
  DEVICE_SYNC_DATA_CHANNEL,
  DeviceSyncChannelMessageSchema,
  SyncChangeSchema,
  openMailboxPlaintext,
  personalSyncWorkspaceId,
  sealMailboxPlaintext,
  workspaceKeyFromB64,
  type SyncChange,
} from '@toolman/shared'
import { appendSyncChanges, listSyncChangelog } from './mobile-sync-store'
import { applyInboundSyncChanges } from './mobile-sync-apply'
import {
  getOrCreatePersonalPairingStore,
  listPairedPersonalDevices,
} from './personal-device-pairing.service'
import { P2pBridge } from './p2p/p2p-bridge'
import { pullMailboxRecords, putMailboxRecord } from './p2p/p2p-mailbox-store'
import { getP2pDeviceInfo } from './p2p/p2p-device-identity.service'
import { logStructured } from './structured-log.service'
import { toErrorMessage } from '@toolman/shared'

const POLL_MS = 2_000
const MAX_PUSH_CHANGES = 200
const PERSONAL_ENTITY_KINDS = new Set([
  'note',
  'classroom_session',
  'knowledge_meta',
])

let timer: ReturnType<typeof setInterval> | null = null
let sinceSeq = 0
let answering = false

function recentPersonalChanges(): SyncChange[] {
  return listSyncChangelog()
    .filter((change) => PERSONAL_ENTITY_KINDS.has(change.entityKind))
    .slice(-MAX_PUSH_CHANGES)
}

async function depositAnswer(input: {
  workspaceId: string
  workspaceKeyB64: string
  recipientDeviceId: string
  inviteId: string
  answerSdp: string
}): Promise<void> {
  const local = getP2pDeviceInfo()
  const workspaceKey = workspaceKeyFromB64(input.workspaceKeyB64)
  const ciphertextB64 = await sealMailboxPlaintext({
    workspaceKey,
    workspaceId: input.workspaceId,
    plaintext: {
      type: 'device.sync.signal',
      senderDeviceId: local.deviceId,
      kind: 'answer',
      payload: { inviteId: input.inviteId, sdp: input.answerSdp },
      depositedAt: Date.now(),
    },
  })
  putMailboxRecord({
    workspaceId: input.workspaceId,
    recipientDeviceId: input.recipientDeviceId,
    seq: Date.now(),
    ciphertextB64,
    depositedAt: Date.now(),
  })
}

async function pushChangesToPeer(peerDeviceId: string): Promise<void> {
  const local = getP2pDeviceInfo()
  const message = DeviceSyncChannelMessageSchema.parse({
    type: 'sync.changes',
    senderDeviceId: local.deviceId,
    changes: recentPersonalChanges(),
  })
  await P2pBridge.connectionSend(
    peerDeviceId,
    DEVICE_SYNC_DATA_CHANNEL,
    Buffer.from(JSON.stringify(message), 'utf8'),
  )
}

async function handleOffer(plain: {
  senderDeviceId: string
  payload: Record<string, unknown>
}): Promise<void> {
  const inviteId = typeof plain.payload.inviteId === 'string' ? plain.payload.inviteId : ''
  const offerSdp = typeof plain.payload.sdp === 'string' ? plain.payload.sdp : ''
  if (!inviteId || !offerSdp) return

  const store = getOrCreatePersonalPairingStore()
  const workspaceId = personalSyncWorkspaceId(store.identityId)
  P2pBridge.cryptoSetWorkspaceKey(workspaceId, store.workspaceKeyB64, 1)

  const joined = await P2pBridge.inviteConnectAsJoiner(
    plain.senderDeviceId,
    workspaceId,
    offerSdp,
    inviteId,
  )
  if (!joined.answerSdp) {
    throw new Error('native invite returned empty answer')
  }

  await depositAnswer({
    workspaceId,
    workspaceKeyB64: store.workspaceKeyB64,
    recipientDeviceId: plain.senderDeviceId,
    inviteId,
    answerSdp: joined.answerSdp,
  })

  await new Promise((resolve) => setTimeout(resolve, 400))
  await pushChangesToPeer(plain.senderDeviceId)
}

function applyPersonalMailboxChanges(changes: SyncChange[]): void {
  if (changes.length === 0) return
  applyInboundSyncChanges(changes)
  appendSyncChanges(changes)
}

async function handlePersonalEnvelope(input: {
  workspaceId: string
  workspaceKey: Uint8Array
  ciphertextB64: string
}): Promise<void> {
  const plain = await openMailboxPlaintext({
    workspaceKey: input.workspaceKey,
    workspaceId: input.workspaceId,
    ciphertextB64: input.ciphertextB64,
  })
  const local = getP2pDeviceInfo()
  if (plain.type === 'device.sync.signal') {
    if (plain.kind !== 'offer') return
    if (plain.senderDeviceId === local.deviceId) return
    await handleOffer({
      senderDeviceId: plain.senderDeviceId,
      payload: plain.payload,
    })
    return
  }
  if (plain.type !== 'device.sync.changes') return
  if (plain.senderDeviceId === local.deviceId) return
  const changes: SyncChange[] = []
  for (const raw of plain.changes) {
    const parsed = SyncChangeSchema.safeParse(raw)
    if (parsed.success) changes.push(parsed.data)
  }
  applyPersonalMailboxChanges(changes)
}

async function pollPersonalDeviceSyncOffers(): Promise<void> {
  if (answering) return
  if (listPairedPersonalDevices().length === 0) return
  answering = true
  try {
    const store = getOrCreatePersonalPairingStore()
    const local = getP2pDeviceInfo()
    const workspaceId = personalSyncWorkspaceId(store.identityId)
    const workspaceKey = workspaceKeyFromB64(store.workspaceKeyB64)
    const envelopes = pullMailboxRecords({
      workspaceId,
      recipientDeviceId: local.deviceId,
      sinceSeq,
      limit: 30,
    })
    for (const envelope of envelopes) {
      sinceSeq = Math.max(sinceSeq, envelope.seq)
      try {
        await handlePersonalEnvelope({
          workspaceId,
          workspaceKey,
          ciphertextB64: envelope.ciphertextB64,
        })
      } catch (error) {
        logStructured(
          'mobile-sync',
          'warn',
          `personal mailbox apply failed: ${toErrorMessage(error, String(error))}`,
        )
      }
    }
  } catch (error) {
    logStructured(
      'mobile-sync',
      'warn',
      `personal webrtc poll failed: ${toErrorMessage(error, String(error))}`,
    )
  } finally {
    answering = false
  }
}

/** Handle inbound device-sync pull requests from the native message drain. */
export async function handlePersonalDeviceSyncChannelMessage(
  peerDeviceId: string,
  payload: Buffer,
): Promise<boolean> {
  try {
    const parsed = DeviceSyncChannelMessageSchema.safeParse(
      JSON.parse(payload.toString('utf8')) as unknown,
    )
    if (!parsed.success) return false
    if (parsed.data.type !== 'sync.pull') return false
    await pushChangesToPeer(peerDeviceId)
    return true
  } catch {
    return false
  }
}

export function startPersonalDeviceWebrtcLoop(): void {
  if (timer) return
  void pollPersonalDeviceSyncOffers()
  timer = setInterval(() => {
    void pollPersonalDeviceSyncOffers()
  }, POLL_MS)
}

export function stopPersonalDeviceWebrtcLoop(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
