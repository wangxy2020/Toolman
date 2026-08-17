import {
  decryptP2pChannelPayload,
  encryptP2pChannelPayload,
  P2P_EVENTS_CHANNEL,
  P2P_FILES_CHANNEL,
} from '@toolman/shared'
import { messageToBytes, toArrayBuffer } from './bytes'
import { handleFileChannelJson } from './blobMesh'
import { handleEventsPlaintext } from './groupChatMesh'
import { emitMeshEvent } from './meshEvents'
import { ignoreAsyncError } from './asyncFail'

export type LiveMeshSession = {
  workspaceId: string
  ownerDeviceId: string
  deviceId: string
  memberId: string
  displayName: string
  workspaceKey: Uint8Array
  pc: RTCPeerConnection
  events: RTCDataChannel | null
  files: RTCDataChannel | null
  lastReceivedSeq: number
}

const sessions = new Map<string, LiveMeshSession>()
const lastSeqByWorkspace = new Map<string, number>()
const SEQ_KEY = 'toolman.mobile.p2p.lastSeq.'

export function readLastSeq(workspaceId: string): number {
  const memory = lastSeqByWorkspace.get(workspaceId) ?? 0
  try {
    const raw = globalThis.localStorage?.getItem(`${SEQ_KEY}${workspaceId}`)
    const value = raw ? Number(raw) : 0
    const stored = Number.isFinite(value) && value > 0 ? value : 0
    return Math.max(memory, stored)
  } catch {
    return memory
  }
}

export function clearLastSeqMemory(): void {
  lastSeqByWorkspace.clear()
}

export function rememberLastSeq(workspaceId: string, seq: number): void {
  const session = sessions.get(workspaceId)
  if (session && seq > session.lastReceivedSeq) session.lastReceivedSeq = seq
  const current = readLastSeq(workspaceId)
  if (seq > current) lastSeqByWorkspace.set(workspaceId, seq)
  try {
    if (seq > current) globalThis.localStorage?.setItem(`${SEQ_KEY}${workspaceId}`, String(seq))
  } catch {
    // ignore
  }
}

export function getLiveSession(workspaceId: string): LiveMeshSession | undefined {
  return sessions.get(workspaceId)
}

export function hasLiveSession(workspaceId: string): boolean {
  const session = sessions.get(workspaceId)
  return Boolean(session && session.pc.connectionState !== 'closed')
}

export function getLiveJoinCount(): number {
  return sessions.size
}

export function closeLiveSession(workspaceId: string): void {
  const existing = sessions.get(workspaceId)
  if (!existing) return
  sessions.delete(workspaceId)
  existing.pc.close()
  emitMeshEvent({ type: 'disconnected', workspaceId })
}

export function createLiveSession(input: {
  workspaceId: string
  ownerDeviceId: string
  deviceId: string
  memberId: string
  displayName: string
  workspaceKey: Uint8Array
  pc: RTCPeerConnection
}): LiveMeshSession {
  closeLiveSession(input.workspaceId)
  const session: LiveMeshSession = {
    ...input,
    events: null,
    files: null,
    lastReceivedSeq: readLastSeq(input.workspaceId),
  }
  sessions.set(input.workspaceId, session)
  return session
}

async function sendPlain(session: LiveMeshSession, channelName: string, plaintext: Uint8Array): Promise<void> {
  const channel = channelName === P2P_FILES_CHANNEL ? session.files : session.events
  if (!channel || channel.readyState !== 'open') {
    throw new Error('P2P 通道未就绪')
  }
  const envelope = await encryptP2pChannelPayload({
    workspaceKey: session.workspaceKey,
    workspaceId: session.workspaceId,
    channel: channelName,
    plaintext,
  })
  channel.send(toArrayBuffer(envelope))
}

export async function sendEventsJson(workspaceId: string, json: string): Promise<void> {
  const session = sessions.get(workspaceId)
  if (!session) throw new Error('尚未与群主建立直连')
  await sendPlain(session, P2P_EVENTS_CHANNEL, new TextEncoder().encode(json))
}

export async function sendFilesJson(workspaceId: string, json: string): Promise<void> {
  const session = sessions.get(workspaceId)
  if (!session) throw new Error('尚未与群主建立直连')
  await sendPlain(session, P2P_FILES_CHANNEL, new TextEncoder().encode(json))
}

async function dispatchChannel(
  session: LiveMeshSession,
  channelName: string,
  data: unknown,
): Promise<void> {
  const envelope = await messageToBytes(data)
  const plain = await decryptP2pChannelPayload({
    workspaceKey: session.workspaceKey,
    workspaceId: session.workspaceId,
    channel: channelName,
    envelope,
  })
  const text = new TextDecoder().decode(plain)
  if (channelName === P2P_FILES_CHANNEL) {
    await handleFileChannelJson(session, text)
    return
  }
  await handleEventsPlaintext(session, text)
}

function bindChannel(session: LiveMeshSession, channel: RTCDataChannel): void {
  channel.binaryType = 'arraybuffer'
  if (channel.label === P2P_FILES_CHANNEL) session.files = channel
  if (channel.label === P2P_EVENTS_CHANNEL) session.events = channel
  channel.onmessage = (event) => {
    ignoreAsyncError(dispatchChannel(session, channel.label, event.data), 'p2p channel')
  }
}

export function attachIncomingChannel(session: LiveMeshSession, channel: RTCDataChannel): void {
  bindChannel(session, channel)
}

export function markSessionConnected(workspaceId: string): void {
  emitMeshEvent({ type: 'connected', workspaceId })
}
