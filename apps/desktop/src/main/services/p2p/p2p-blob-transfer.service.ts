import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs'
import { logStructured } from '../structured-log.service'
import { open } from 'node:fs/promises'
import { toErrorMessage } from '@toolman/shared'
import { join } from 'node:path'
import { app } from 'electron'
import { createHash, randomUUID } from 'node:crypto'
import { hashFileBytes } from '@toolman/knowledge'
import { P2pMemberRepository, P2pSharedResourceRepository } from '@toolman/db'
import {
  blobExists,
  ensureBlobRecord,
  getBlobMeta,
  getBlobStoragePath,
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
import {
  deleteBlobReceiveSession,
  listBlobReceiveSessions,
  saveBlobReceiveSession,
} from './p2p-blob-session-store'

const MAX_CONCURRENT_BLOB_SENDS = 2
let activeBlobSends = 0
const blobSendWaiters: Array<() => void> = []

async function acquireBlobSendSlot(): Promise<void> {
  if (activeBlobSends < MAX_CONCURRENT_BLOB_SENDS) {
    activeBlobSends += 1
    return
  }
  await new Promise<void>((resolve) => {
    blobSendWaiters.push(resolve)
  })
  activeBlobSends += 1
}

function releaseBlobSendSlot(): void {
  activeBlobSends = Math.max(0, activeBlobSends - 1)
  const next = blobSendWaiters.shift()
  if (next) next()
}

export function getPendingBlobTransferCount(): number {
  return receiveSessions.size + inFlightFetches.size + activeBlobSends
}

function blobChunkPartPath(contentHash: string, index: number): string {
  const dir = join(app.getPath('userData'), 'p2p', 'blob-parts', contentHash)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return join(dir, `${index}.part`)
}

function writeBlobChunkPart(contentHash: string, index: number, data: Buffer): void {
  writeFileSync(blobChunkPartPath(contentHash, index), data)
}

function readBlobChunkPart(contentHash: string, index: number): Buffer | null {
  const path = blobChunkPartPath(contentHash, index)
  if (!existsSync(path)) return null
  return readFileSync(path)
}

function clearBlobChunkParts(contentHash: string): void {
  const dir = join(app.getPath('userData'), 'p2p', 'blob-parts', contentHash)
  if (!existsSync(dir)) return
  for (let index = 0; index < 10_000; index += 1) {
    const path = join(dir, `${index}.part`)
    if (!existsSync(path)) {
      if (index > 0) break
      continue
    }
    try {
      unlinkSync(path)
    } catch {
      // ignore
    }
  }
}

interface BlobReceiveSession {
  workspaceId: string
  contentHash: string
  mimeType?: string
  sizeBytes: number
  totalChunks: number
  receivedCount: number
  peerDeviceId: string
  transferId: string
}

const receiveSessions = new Map<string, BlobReceiveSession>()
const pendingFetchResolvers = new Map<
  string,
  { resolve: (value: boolean) => void; reject: (error: Error) => void }
>()
const inFlightFetches = new Set<string>()

function listReceivedChunkIndices(contentHash: string, totalChunks: number): number[] {
  const indices: number[] = []
  for (let index = 0; index < totalChunks; index += 1) {
    if (readBlobChunkPart(contentHash, index)) {
      indices.push(index)
    }
  }
  return indices
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
  mimeType: string,
  transferId: string,
  mode: 'request' | 'push',
): Promise<void> {
  const filePath = getBlobStoragePath(contentHash)
  const sizeBytes = statSync(filePath).size
  await acquireBlobSendSlot()
  const fileHandle = await open(filePath, 'r')
  try {
    const totalChunks = chunkCountForSize(sizeBytes)
    const metaMessage =
      mode === 'request'
        ? {
            type: 'blob.meta' as const,
            requestId: transferId,
            workspaceId,
            contentHash,
            sizeBytes,
            mimeType,
            totalChunks,
          }
        : {
            type: 'blob.push.start' as const,
            pushId: transferId,
            workspaceId,
            contentHash,
            sizeBytes,
            mimeType,
            totalChunks,
          }

    await sendFileMessage(peerDeviceId, metaMessage)

    for (let index = 0; index < totalChunks; index += 1) {
      const start = index * P2P_BLOB_CHUNK_SIZE
      const end = Math.min(start + P2P_BLOB_CHUNK_SIZE, sizeBytes)
      const chunkLength = end - start
      const chunk = Buffer.alloc(chunkLength)
      const { bytesRead } = await fileHandle.read(chunk, 0, chunkLength, start)
      if (bytesRead !== chunkLength) {
        throw new Error(`blob read short at chunk ${index}`)
      }
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
  } finally {
    await fileHandle.close()
    releaseBlobSendSlot()
  }
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
    receivedCount: 0,
    peerDeviceId: input.peerDeviceId,
    transferId: input.transferId,
  }
  receiveSessions.set(input.transferId, session)
  saveBlobReceiveSession({
    transferId: input.transferId,
    workspaceId: input.workspaceId,
    contentHash: input.contentHash,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    totalChunks: input.totalChunks,
    peerDeviceId: input.peerDeviceId,
    receivedIndices: [],
    updatedAt: Date.now(),
  })
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
    logStructured('p2p', 'warn', `incomplete blob transfer for ${session.contentHash}`)
  }
}

function assembleBlobFromChunkParts(session: BlobReceiveSession): boolean {
  const targetPath = getBlobStoragePath(session.contentHash)
  if (existsSync(targetPath)) {
    return true
  }

  const tempPath = `${targetPath}.partial`
  const hash = createHash('sha256')
  let fd: number | null = null
  try {
    fd = openSync(tempPath, 'w')
    let totalWritten = 0
    for (let index = 0; index < session.totalChunks; index += 1) {
      const part = readBlobChunkPart(session.contentHash, index)
      if (!part) {
        return false
      }
      hash.update(part)
      writeSync(fd, part)
      totalWritten += part.length
    }
    closeSync(fd)
    fd = null

    if (totalWritten !== session.sizeBytes) {
      unlinkSync(tempPath)
      return false
    }

    const digest = hash.digest('hex')
    if (digest !== session.contentHash) {
      logStructured('p2p', 'warn', `blob hash mismatch for ${session.contentHash}: got ${digest}`)
      unlinkSync(tempPath)
      return false
    }

    renameSync(tempPath, targetPath)
    ensureBlobRecord(session.contentHash, session.mimeType ?? 'application/octet-stream', session.sizeBytes)
    return true
  } catch (error) {
    if (fd != null) {
      try {
        closeSync(fd)
      } catch {
        // ignore
      }
    }
    if (existsSync(tempPath)) {
      try {
        unlinkSync(tempPath)
      } catch {
        // ignore
      }
    }
    logStructured('p2p', 'warn', `blob assembly failed for ${session.contentHash}: ${toErrorMessage(error, 'assembly failed')}`)
    return false
  }
}

function finalizeReceiveSession(session: BlobReceiveSession): boolean {
  receiveSessions.delete(session.transferId)
  deleteBlobReceiveSession(session.transferId)

  if (blobExists(session.contentHash)) {
    clearBlobChunkParts(session.contentHash)
    return true
  }

  if (session.receivedCount < session.totalChunks) {
    let onDisk = 0
    for (let index = 0; index < session.totalChunks; index += 1) {
      if (readBlobChunkPart(session.contentHash, index)) {
        onDisk += 1
      }
    }
    if (onDisk !== session.totalChunks) {
      return false
    }
  }

  const ok = assembleBlobFromChunkParts(session)
  if (ok) {
    clearBlobChunkParts(session.contentHash)
    broadcastP2pSyncCompleted({
      workspaceId: session.workspaceId,
      eventsApplied: 0,
      filesFetched: 1,
    })
  }
  return ok
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

  const meta = getBlobMeta(message.contentHash)
  await sendBlobToPeer(
    peerDeviceId,
    message.workspaceId,
    message.contentHash,
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

  if (readBlobChunkPart(contentHash, index)) {
    return
  }

  const chunk = Buffer.from(dataB64, 'base64')
  writeBlobChunkPart(contentHash, index, chunk)
  session.receivedCount += 1
  saveBlobReceiveSession({
    transferId: session.transferId,
    workspaceId: session.workspaceId,
    contentHash: session.contentHash,
    mimeType: session.mimeType,
    sizeBytes: session.sizeBytes,
    totalChunks: session.totalChunks,
    peerDeviceId: session.peerDeviceId,
    receivedIndices: listReceivedChunkIndices(contentHash, totalChunks),
    updatedAt: Date.now(),
  })
  broadcastFileProgress(session.workspaceId, session.receivedCount, totalChunks)
}

type BlobChannelHandler = (peerDeviceId: string, message: FileChannelMessage) => Promise<void> | void

const BLOB_CHANNEL_HANDLERS: Record<FileChannelMessage['type'], BlobChannelHandler> = {
  'blob.request': (peerDeviceId, message) => {
    if (message.type !== 'blob.request') return
    return handleBlobRequest(peerDeviceId, message)
  },
  'blob.not_found': (_peerDeviceId, message) => {
    if (message.type !== 'blob.not_found') return
    pendingFetchResolvers.get(message.requestId)?.resolve(false)
    pendingFetchResolvers.delete(message.requestId)
  },
  'blob.meta': (peerDeviceId, message) => {
    if (message.type !== 'blob.meta') return
    startReceiveSession({
      transferId: message.requestId,
      workspaceId: message.workspaceId,
      contentHash: message.contentHash,
      mimeType: message.mimeType,
      sizeBytes: message.sizeBytes,
      totalChunks: message.totalChunks,
      peerDeviceId,
    })
  },
  'blob.chunk': (_peerDeviceId, message) => {
    if (message.type !== 'blob.chunk') return
    handleIncomingChunk(
      message.requestId,
      message.index,
      message.totalChunks,
      message.data,
      message.contentHash,
    )
  },
  'blob.complete': (_peerDeviceId, message) => {
    if (message.type !== 'blob.complete') return
    completeReceiveSession(message.requestId)
  },
  'blob.push.start': (peerDeviceId, message) => {
    if (message.type !== 'blob.push.start') return
    startReceiveSession({
      transferId: message.pushId,
      workspaceId: message.workspaceId,
      contentHash: message.contentHash,
      mimeType: message.mimeType,
      sizeBytes: message.sizeBytes,
      totalChunks: message.totalChunks,
      peerDeviceId,
    })
  },
  'blob.push.chunk': (_peerDeviceId, message) => {
    if (message.type !== 'blob.push.chunk') return
    handleIncomingChunk(
      message.pushId,
      message.index,
      message.totalChunks,
      message.data,
      message.contentHash,
    )
  },
  'blob.push.complete': (_peerDeviceId, message) => {
    if (message.type !== 'blob.push.complete') return
    completeReceiveSession(message.pushId)
  },
}

export async function handleP2pFileChannelMessage(
  peerDeviceId: string,
  payload: Buffer,
): Promise<void> {
  const message = parseFileChannelMessage(payload)
  if (!message) return

  await BLOB_CHANNEL_HANDLERS[message.type](peerDeviceId, message)
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
      reject(new Error(toErrorMessage(error, 'blob request failed')))
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
        const message = toErrorMessage(error, String(error))
        logStructured('p2p', 'warn', `blob fetch from ${peerDeviceId} failed: ${message}`)
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
        const message = toErrorMessage(error, String(error))
        logStructured('p2p', 'warn', `blob push to ${peer.peerDeviceId} failed: ${message}`)
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

function restoreReceiveSessionFromDisk(
  persisted: import('./p2p-blob-session-store').PersistedBlobReceiveSession,
): BlobReceiveSession | null {
  return {
    workspaceId: persisted.workspaceId,
    contentHash: persisted.contentHash,
    mimeType: persisted.mimeType,
    sizeBytes: persisted.sizeBytes,
    totalChunks: persisted.totalChunks,
    receivedCount: persisted.receivedIndices.length,
    peerDeviceId: persisted.peerDeviceId,
    transferId: persisted.transferId,
  }
}

export async function resumeInterruptedBlobTransfers(): Promise<void> {
  for (const persisted of listBlobReceiveSessions()) {
    if (blobExists(persisted.contentHash)) {
      deleteBlobReceiveSession(persisted.transferId)
      clearBlobChunkParts(persisted.contentHash)
      continue
    }

    const session = restoreReceiveSessionFromDisk(persisted)
    if (!session) {
      deleteBlobReceiveSession(persisted.transferId)
      continue
    }

    if (session.receivedCount >= session.totalChunks) {
      finalizeReceiveSession(session)
      continue
    }

    receiveSessions.set(persisted.transferId, session)
    logStructured('p2p', 'info', `restored partial blob receive ${persisted.contentHash.slice(0, 8)} (${session.receivedCount}/${session.totalChunks} chunks)`)
    void fetchBlobFromPeers(
      persisted.workspaceId,
      persisted.contentHash,
      persisted.mimeType,
      persisted.peerDeviceId,
    ).catch((error) => {
      logStructured('p2p', 'warn', `blob resume fetch failed for ${persisted.contentHash.slice(0, 8)}: ${toErrorMessage(error, 'blob resume fetch failed')}`)
    })
  }
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
