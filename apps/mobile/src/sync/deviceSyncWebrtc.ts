/**
 * Phase 3: personal device-sync over WebRTC DataChannel.
 * Signaling uses encrypted personal mailbox (`device.sync.signal`).
 */
import {
  DEVICE_SYNC_DATA_CHANNEL,
  DEFAULT_STUN_URLS,
  DeviceSyncChannelMessageSchema,
  SyncChangeSchema,
  buildMailboxGrant,
  decodeWorkspaceKeyB64,
  openMailboxPlaintext,
  sealMailboxPlaintext,
  type DevicePairingRecord,
  type SyncChange,
} from '@toolman/shared'
import { ToolmanSyncClient } from '@toolman/sync-client'
import { getMobileSyncBaseUrl, loadSyncHubToken } from './mobileSync-client'

const boundFetch: typeof fetch = (input, init) => globalThis.fetch.call(globalThis, input, init)
const ICE_GATHER_TIMEOUT_MS = 6_000
const ANSWER_WAIT_MS = 6_000
const CHANNEL_WAIT_MS = 8_000

export type DeviceSyncSignal = {
  kind: 'offer' | 'answer' | 'ice'
  payload: Record<string, unknown>
  senderDeviceId: string
}

export type DeviceSyncWebrtcResult =
  | { ok: true; changes: SyncChange[]; transport: 'webrtc' }
  | { ok: false }

function toRtcIceServers(): RTCIceServer[] {
  return DEFAULT_STUN_URLS.map((urls) => ({ urls }))
}

function waitForIceGathering(pc: RTCPeerConnection, timeoutMs = ICE_GATHER_TIMEOUT_MS): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve()
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer)
      pc.removeEventListener('icegatheringstatechange', onChange)
      resolve()
    }
    const onChange = () => {
      if (pc.iceGatheringState === 'complete') finish()
    }
    const timer = setTimeout(finish, timeoutMs)
    pc.addEventListener('icegatheringstatechange', onChange)
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function depositDeviceSyncSignal(input: {
  pairing: DevicePairingRecord
  recipientDeviceId: string
  kind: DeviceSyncSignal['kind']
  payload: Record<string, unknown>
}): Promise<boolean> {
  try {
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
        type: 'device.sync.signal',
        senderDeviceId: input.pairing.localDeviceId,
        kind: input.kind,
        payload: input.payload,
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
  } catch {
    return false
  }
}

export async function pullDeviceSyncSignals(
  pairing: DevicePairingRecord,
  sinceSeq = 0,
): Promise<{ signals: DeviceSyncSignal[]; nextSeq: number }> {
  const workspaceKey = decodeWorkspaceKeyB64(pairing.workspaceKeyB64)
  const grant = await buildMailboxGrant({
    workspaceKey,
    workspaceId: pairing.workspaceId,
    deviceId: pairing.localDeviceId,
  })
  const client = new ToolmanSyncClient({
    baseUrl: pairing.hubBaseUrlHint || getMobileSyncBaseUrl(),
    getAccessToken: async () => null,
    getSyncToken: loadSyncHubToken,
    fetchImpl: boundFetch,
  })
  const pulled = await client.pullMailbox({
    workspaceId: pairing.workspaceId,
    deviceId: pairing.localDeviceId,
    grant,
    sinceSeq,
    limit: 50,
  })
  const signals: DeviceSyncSignal[] = []
  let nextSeq = sinceSeq
  for (const envelope of pulled.envelopes ?? []) {
    nextSeq = Math.max(nextSeq, envelope.seq)
    try {
      const plain = await openMailboxPlaintext({
        workspaceKey,
        workspaceId: pairing.workspaceId,
        ciphertextB64: envelope.ciphertextB64,
      })
      if (plain.type !== 'device.sync.signal') continue
      if (plain.senderDeviceId === pairing.localDeviceId) continue
      signals.push({
        kind: plain.kind,
        payload: plain.payload,
        senderDeviceId: plain.senderDeviceId,
      })
    } catch {
      // skip
    }
  }
  return { signals, nextSeq }
}

async function waitForAnswerSdp(
  pairing: DevicePairingRecord,
  inviteId: string,
  sinceSeq: number,
): Promise<string | null> {
  const deadline = Date.now() + ANSWER_WAIT_MS
  let seq = sinceSeq
  while (Date.now() < deadline) {
    const pulled = await pullDeviceSyncSignals(pairing, seq)
    seq = pulled.nextSeq
    for (const signal of pulled.signals) {
      if (signal.kind !== 'answer') continue
      if (signal.payload.inviteId !== inviteId) continue
      const sdp = signal.payload.sdp
      if (typeof sdp === 'string' && sdp.length > 0) return sdp
    }
    await sleep(800)
  }
  return null
}

function waitForChannelOpen(channel: RTCDataChannel, timeoutMs: number): Promise<boolean> {
  if (channel.readyState === 'open') return Promise.resolve(true)
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      cleanup()
      resolve(false)
    }, timeoutMs)
    const onOpen = () => {
      cleanup()
      resolve(true)
    }
    const cleanup = () => {
      clearTimeout(timer)
      channel.removeEventListener('open', onOpen)
    }
    channel.addEventListener('open', onOpen)
  })
}

function waitForSyncChanges(
  channel: RTCDataChannel,
  timeoutMs: number,
): Promise<SyncChange[]> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      cleanup()
      resolve([])
    }, timeoutMs)
    const onMessage = (event: MessageEvent) => {
      try {
        const text = typeof event.data === 'string' ? event.data : ''
        if (!text) return
        const parsed = DeviceSyncChannelMessageSchema.safeParse(JSON.parse(text))
        if (!parsed.success || parsed.data.type !== 'sync.changes') return
        const changes: SyncChange[] = []
        for (const raw of parsed.data.changes) {
          const item = SyncChangeSchema.safeParse(raw)
          if (item.success) changes.push(item.data)
        }
        cleanup()
        resolve(changes)
      } catch {
        // ignore
      }
    }
    const cleanup = () => {
      clearTimeout(timer)
      channel.removeEventListener('message', onMessage)
    }
    channel.addEventListener('message', onMessage)
  })
}

/**
 * Attempt a live WebRTC sync session. Returns changes when the peer answers
 * and pushes over the device-sync DataChannel; otherwise fall back to mailbox/HTTP.
 */
export async function tryDeviceSyncWebrtc(
  pairing: DevicePairingRecord,
): Promise<DeviceSyncWebrtcResult> {
  if (typeof RTCPeerConnection === 'undefined') return { ok: false }

  const inviteId = `psync-${pairing.localDeviceId}-${Date.now()}`
  const pc = new RTCPeerConnection({ iceServers: toRtcIceServers() })
  const channel = pc.createDataChannel(DEVICE_SYNC_DATA_CHANNEL, { ordered: true })

  try {
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    await waitForIceGathering(pc)
    const offerSdp = pc.localDescription?.sdp
    if (!offerSdp) return { ok: false }

    const deposited = await depositDeviceSyncSignal({
      pairing,
      recipientDeviceId: pairing.peerDeviceId,
      kind: 'offer',
      payload: { inviteId, sdp: offerSdp },
    })
    if (!deposited) return { ok: false }

    const answerSdp = await waitForAnswerSdp(pairing, inviteId, 0)
    if (!answerSdp) return { ok: false }

    await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp })
    const opened = await waitForChannelOpen(channel, CHANNEL_WAIT_MS)
    if (!opened) return { ok: false }

    channel.send(
      JSON.stringify({
        type: 'sync.pull',
        senderDeviceId: pairing.localDeviceId,
        cursor: null,
      }),
    )
    const changes = await waitForSyncChanges(channel, CHANNEL_WAIT_MS)
    if (changes.length === 0) {
      // Peer may push without waiting for pull; still count as webrtc success if channel opened.
      return { ok: true, changes: [], transport: 'webrtc' }
    }
    return { ok: true, changes, transport: 'webrtc' }
  } catch {
    return { ok: false }
  } finally {
    try {
      channel.close()
    } catch {
      // ignore
    }
    try {
      pc.close()
    } catch {
      // ignore
    }
  }
}
