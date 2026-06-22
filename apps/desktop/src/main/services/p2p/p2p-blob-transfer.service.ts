import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { hashFileBytes } from '@toolman/knowledge'
import { P2pMemberRepository, P2pSharedResourceRepository } from '@toolman/db'
import {
  blobExists,
  getBlobMeta,
  readBlobBytes,
  writeBlobFromBuffer,
  writeBlobFromPath,
} from '../blob.service'
import { getDatabase } from '../../bootstrap/database'
import { getDocumentRepository } from '../../db/repos'
import { P2pBridge } from './p2p-bridge'
import { ensurePeerReadyForWorkspace, listP2pConnections } from './p2p-connection.service'
import { getP2pDeviceInfo } from './p2p-device-identity.service'
import { assertPeerTrustedForSync, isPeerTrusted } from './p2p-peer.service'
import {
  broadcastP2pSyncCompleted,
  broadcastP2pSyncProgress,
} from './p2p-sync-broadcast'
import {
  chunkCountForSize,
  encodeFileChannelMessage,
  P2P_BLOB_CHUNK_SIZE,
  parseFileChannelMessage,
  type FileChannelMessage,
} from './p2p-file-protocol'

interface BlobReceiveSession {
  workspaceId: string
  contentHash: string
  mimeType?: string
  sizeBytes: number
  totalChunks: number
  chunks: Map<number, Buffer>
  peerDeviceId: string
  transferId: string
}

const receiveSessions = new Map<string, BlobReceiveSession>()
const pendingFetchResolvers = new Map<
  string,
  { resolve: (value: boolean) => void; reject: (error: Error) => void }
>()
const inFlightFetches = new Set<string>()

function sha256Hex(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

function listActiveWorkspacePeerIds(workspaceId: string): string[] {
  const device = getP2pDeviceInfo()
  return new P2pMemberRepository(getDatabase())
    .listByWorkspace(workspaceId, 'active')
    .filter((member) => member.deviceId !== device.deviceId)
    .map((member) => member.deviceId)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function waitForBlob(contentHash: string, maxWaitMs = 60_000): Promise<boolean> {
  const deadline = Date.now() + maxWaitMs
  while (Date.now() < deadline) {
    if (blobExists(contentHash)) return true
    await sleep(250)
  }
  return blobExists(contentHash)
}

async function sendFileMessage(peerDeviceId: string, message: FileChannelMessage): Promise<void> {
  await P2pBridge.connectionSend(peerDeviceId, 'files', encodeFileChannelMessage(message))
}

function broadcastFileProgress(
  workspaceId: string,
  current: number,
  total: number,
): void {
  broadcastP2pSyncProgress({
    workspaceId,
    phase: 'files',
    current,
    total,
  })
}

async function sendBlobToPeer(
  peerDeviceId: string,
  workspaceId: string,
  contentHash: string,
  data: Buffer,
  mimeType: string,
  transferId: string,
  mode: 'request' | 'push',
): Promise<void> {
  const totalChunks = chunkCountForSize(data.length)
  const metaMessage =
    mode === 'request'
      ? {
          type: 'blob.meta' as const,
          requestId: transferId,
          workspaceId,
          contentHash,
          sizeBytes: data.length,
          mimeType,
          totalChunks,
        }
      : {
          type: 'blob.push.start' as const,
          pushId: transferId,
          workspaceId,
          contentHash,
          sizeBytes: data.length,
          mimeType,
          totalChunks,
        }

  await sendFileMessage(peerDeviceId, metaMessage)

  for (let index = 0; index < totalChunks; index += 1) {
    const start = index * P2P_BLOB_CHUNK_SIZE
    const end = Math.min(start + P2P_BLOB_CHUNK_SIZE, data.length)
    const chunk = data.subarray(start, end)
    const chunkMessage =
      mode === 'request'
        ? {
            type: 'blob.chunk' as const,
            requestId: transferId,
            contentHash,
            index,
            totalChunks,
            data: chunk.toString('base64'),
          }
        : {
            type: 'blob.push.chunk' as const,
            pushId: transferId,
            contentHash,
            index,
            totalChunks,
            data: chunk.toString('base64'),
          }

    await sendFileMessage(peerDeviceId, chunkMessage)
    broadcastFileProgress(workspaceId, index + 1, totalChunks)
  }

  await sendFileMessage(
    peerDeviceId,
    mode === 'request'
      ? { type: 'blob.complete', requestId: transferId, contentHash }
      : { type: 'blob.push.complete', pushId: transferId, contentHash },
  )
}

function startReceiveSession(input: {
  transferId: string
  workspaceId: string
  contentHash: string
  mimeType?: string
  sizeBytes: number
  totalChunks: number
  peerDeviceId: string
}): BlobReceiveSession {
  const session: BlobReceiveSession = {
    workspaceId: input.workspaceId,
    contentHash: input.contentHash,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    totalChunks: input.totalChunks,
    chunks: new Map(),
    peerDeviceId: input.peerDeviceId,
    transferId: input.transferId,
  }
  receiveSessions.set(input.transferId, session)
  return session
}

function completeReceiveSession(sessionKey: string): void {
  const session = receiveSessions.get(sessionKey)
  if (!session) return

  const ok = finalizeReceiveSession(session)
  const pending = pendingFetchResolvers.get(sessionKey)
  if (pending) {
    pendingFetchResolvers.delete(sessionKey)
    pending.resolve(ok)
  } else if (!ok) {
    console.warn(`[p2p] incomplete blob transfer for ${session.contentHash}`)
  }
}

function finalizeReceiveSession(session: BlobReceiveSession): boolean {
  receiveSessions.delete(session.transferId)

  if (blobExists(session.contentHash)) {
    return true
  }

  if (session.chunks.size !== session.totalChunks) {
    return false
  }

  const parts: Buffer[] = []
  for (let index = 0; index < session.totalChunks; index += 1) {
    const chunk = session.chunks.get(index)
    if (!chunk) return false
    parts.push(chunk)
  }

  const data = Buffer.concat(parts)
  if (data.length !== session.sizeBytes) {
    return false
  }

  const actualHash = sha256Hex(data)
  if (actualHash !== session.contentHash) {
    console.warn(
      `[p2p] blob hash mismatch for ${session.contentHash}: got ${actualHash}`,
    )
    return false
  }

  writeBlobFromBuffer(data, session.mimeType ?? 'application/octet-stream')
  broadcastP2pSyncCompleted({
    workspaceId: session.workspaceId,
    eventsApplied: 0,
    filesFetched: 1,
  })
  return true
}

async function tryRecoverBlobFromSharedKnowledge(
  workspaceId: string,
  contentHash: string,
): Promise<boolean> {
  if (blobExists(contentHash)) return true

  const sharedRepo = new P2pSharedResourceRepository(getDatabase())
  const docRepo = getDocumentRepository()

  for (const resource of sharedRepo.listByWorkspace(workspaceId)) {
    if (resource.resourceType !== 'Knowledge' || resource.status !== 'active') continue
    const kbId = resource.localResourceId ?? resource.id
    for (const doc of docRepo.listByKb(kbId)) {
      if (doc.blobHash !== contentHash && doc.contentHash !== contentHash) continue
      if (!doc.absolutePath || !existsSync(doc.absolutePath)) continue
      try {
        if (hashFileBytes(doc.absolutePath) !== contentHash) continue
        writeBlobFromPath(doc.absolutePath)
        return blobExists(contentHash)
      } catch {
        continue
      }
    }
  }

  return false
}

async function handleBlobRequest(
  peerDeviceId: string,
  message: Extract<FileChannelMessage, { type: 'blob.request' }>,
): Promise<void> {
  assertPeerTrustedForSync(message.workspaceId, peerDeviceId)

  if (!blobExists(message.contentHash)) {
    await tryRecoverBlobFromSharedKnowledge(message.workspaceId, message.contentHash)
  }

  if (!blobExists(message.contentHash)) {
    await sendFileMessage(peerDeviceId, {
      type: 'blob.not_found',
      requestId: message.requestId,
      contentHash: message.contentHash,
    })
    return
  }

  const data = readBlobBytes(message.contentHash)
  const meta = getBlobMeta(message.contentHash)
  await sendBlobToPeer(
    peerDeviceId,
    message.workspaceId,
    message.contentHash,
    data,
    meta?.mimeType ?? 'application/octet-stream',
    message.requestId,
    'request',
  )
}

function handleIncomingChunk(
  sessionKey: string,
  index: number,
  totalChunks: number,
  dataB64: string,
  contentHash: string,
): void {
  const session = receiveSessions.get(sessionKey)
  if (!session || session.contentHash !== contentHash) {
    return
  }

  session.chunks.set(index, Buffer.from(dataB64, 'base64'))
  broadcastFileProgress(session.workspaceId, session.chunks.size, totalChunks)
}

export async function handleP2pFileChannelMessage(
  peerDeviceId: string,
  payload: Buffer,
): Promise<void> {
  const message = parseFileChannelMessage(payload)
  if (!message) return

  switch (message.type) {
    case 'blob.request':
      await handleBlobRequest(peerDeviceId, message)
      break
    case 'blob.not_found':
      pendingFetchResolvers.get(message.requestId)?.resolve(false)
      pendingFetchResolvers.delete(message.requestId)
      break
    case 'blob.meta':
      startReceiveSession({
        transferId: message.requestId,
        workspaceId: message.workspaceId,
        contentHash: message.contentHash,
        mimeType: message.mimeType,
        sizeBytes: message.sizeBytes,
        totalChunks: message.totalChunks,
        peerDeviceId,
      })
      break
    case 'blob.chunk':
      handleIncomingChunk(
        message.requestId,
        message.index,
        message.totalChunks,
        message.data,
        message.contentHash,
      )
      break
    case 'blob.complete':
      completeReceiveSession(message.requestId)
      break
    case 'blob.push.start':
      startReceiveSession({
        transferId: message.pushId,
        workspaceId: message.workspaceId,
        contentHash: message.contentHash,
        mimeType: message.mimeType,
        sizeBytes: message.sizeBytes,
        totalChunks: message.totalChunks,
        peerDeviceId,
      })
      break
    case 'blob.push.chunk':
      handleIncomingChunk(
        message.pushId,
        message.index,
        message.totalChunks,
        message.data,
        message.contentHash,
      )
      break
    case 'blob.push.complete':
      completeReceiveSession(message.pushId)
      break
    default:
      break
  }
}

async function requestBlobFromPeer(
  workspaceId: string,
  peerDeviceId: string,
  contentHash: string,
  mimeType?: string,
): Promise<boolean> {
  if (!isPeerTrusted(workspaceId, peerDeviceId)) {
    return false
  }

  const connections = await listP2pConnections()
  const connected = connections.some(
    (item) => item.peerDeviceId === peerDeviceId && item.state === 'connected',
  )
  if (!connected) {
    await ensurePeerReadyForWorkspace(peerDeviceId, workspaceId)
  }

  const requestId = randomUUID()
  const result = await new Promise<boolean>((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingFetchResolvers.delete(requestId)
      receiveSessions.delete(requestId)
      resolve(false)
    }, 60_000)

    pendingFetchResolvers.set(requestId, {
      resolve: (value) => {
        clearTimeout(timeout)
        resolve(value)
      },
      reject: (error) => {
        clearTimeout(timeout)
        reject(error)
      },
    })

    void sendFileMessage(peerDeviceId, {
      type: 'blob.request',
      workspaceId,
      contentHash,
      requestId,
    }).catch((error) => {
      clearTimeout(timeout)
      pendingFetchResolvers.delete(requestId)
      reject(error instanceof Error ? error : new Error(String(error)))
    })
  })

  if (result && mimeType && blobExists(contentHash)) {
    return true
  }
  return result
}

export async function fetchBlobFromPeers(
  workspaceId: string,
  contentHash: string,
  mimeType?: string,
  preferredPeerDeviceId?: string,
): Promise<boolean> {
  if (!contentHash || blobExists(contentHash)) {
    return true
  }

  const fetchKey = `${workspaceId}:${contentHash}`
  if (inFlightFetches.has(fetchKey)) {
    return waitForBlob(contentHash)
  }
  inFlightFetches.add(fetchKey)

  try {
    const device = getP2pDeviceInfo()
    const memberPeerIds = new Set(listActiveWorkspacePeerIds(workspaceId))
    const connections = await listP2pConnections()
    const peers = connections
      .filter(
        (item) =>
          item.state === 'connected' &&
          item.peerDeviceId !== device.deviceId &&
          memberPeerIds.has(item.peerDeviceId),
      )
      .map((item) => item.peerDeviceId)

    const peerOrder = preferredPeerDeviceId
      ? [preferredPeerDeviceId, ...peers.filter((peer) => peer !== preferredPeerDeviceId)]
      : peers

    for (const peerDeviceId of peerOrder) {
      try {
        await ensurePeerReadyForWorkspace(peerDeviceId, workspaceId)
        const ok = await requestBlobFromPeer(
          workspaceId,
          peerDeviceId,
          contentHash,
          mimeType,
        )
        if (ok && blobExists(contentHash)) {
          return true
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.warn(`[p2p] blob fetch from ${peerDeviceId} failed: ${message}`)
      }
    }

    return blobExists(contentHash)
  } finally {
    inFlightFetches.delete(fetchKey)
  }
}

const BLOB_PUSH_PEER_TIMEOUT_MS = 15_000

export async function pushBlobToPeers(
  workspaceId: string,
  contentHash: string,
  mimeType?: string,
): Promise<void> {
  if (!blobExists(contentHash)) return

  const device = getP2pDeviceInfo()
  const memberPeerIds = new Set(listActiveWorkspacePeerIds(workspaceId))
  const data = readBlobBytes(contentHash)
  const connections = await listP2pConnections()
  const peers = connections.filter(
    (item) =>
      item.state === 'connected' &&
      item.peerDeviceId !== device.deviceId &&
      memberPeerIds.has(item.peerDeviceId),
  )

  await Promise.all(
    peers.map(async (peer) => {
      if (!isPeerTrusted(workspaceId, peer.peerDeviceId)) return
      try {
        await Promise.race([
          (async () => {
            await ensurePeerReadyForWorkspace(peer.peerDeviceId, workspaceId)
            const pushId = randomUUID()
            await sendBlobToPeer(
              peer.peerDeviceId,
              workspaceId,
              contentHash,
              data,
              mimeType ?? 'application/octet-stream',
              pushId,
              'push',
            )
          })(),
          sleep(BLOB_PUSH_PEER_TIMEOUT_MS).then(() => {
            throw new Error('blob push timed out')
          }),
        ])
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.warn(`[p2p] blob push to ${peer.peerDeviceId} failed: ${message}`)
      }
    }),
  )

  if (peers.length > 0) {
    broadcastP2pSyncCompleted({
      workspaceId,
      eventsApplied: 0,
      filesFetched: peers.length,
    })
  }
}

export function scheduleBlobFetch(
  workspaceId: string,
  contentHash: string | null | undefined,
  mimeType?: string,
): void {
  if (!contentHash || blobExists(contentHash)) return
  void fetchBlobFromPeers(workspaceId, contentHash, mimeType)
}

export async function syncMissingWorkspaceBlobs(workspaceId: string): Promise<number> {
  const resources = new P2pSharedResourceRepository(getDatabase()).listFilesByWorkspace(workspaceId)

  let fetched = 0
  for (const resource of resources) {
    const hash = resource.contentHash
    if (!hash || blobExists(hash)) continue

    let mimeType: string | undefined
    try {
      const metadata = JSON.parse(resource.metadataJson) as { mimeType?: string }
      mimeType = metadata.mimeType
    } catch {
      mimeType = undefined
    }

    const ok = await fetchBlobFromPeers(workspaceId, hash, mimeType)
    if (ok) fetched += 1
  }

  return fetched
}
