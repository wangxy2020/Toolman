import {
  closeSync,
  existsSync,
  openSync,
  renameSync,
  unlinkSync,
  writeSync,
} from 'node:fs'
import { logStructured } from '../structured-log.service'
import { toErrorMessage } from '@toolman/shared'
import { createHash } from 'node:crypto'
import {
  blobExists,
  ensureBlobRecord,
  getBlobStoragePath,
} from '../blob.service'
import {
  deleteBlobReceiveSession,
  saveBlobReceiveSession,
} from './p2p-blob-session-store'
import { broadcastP2pSyncCompleted } from './p2p-sync-broadcast'
import {
  clearBlobChunkParts,
  listReceivedChunkIndices,
  readBlobChunkPart,
  writeBlobChunkPart,
} from './p2p-blob-chunk-parts'
import { broadcastFileProgress } from './p2p-blob-file-messages'
import {
  pendingFetchResolvers,
  receiveSessions,
  type BlobReceiveSession,
} from './p2p-blob-transfer-state'

export function startReceiveSession(input: {
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

export function finalizeReceiveSession(session: BlobReceiveSession): boolean {
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

export function completeReceiveSession(sessionKey: string): void {
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

export function handleIncomingChunk(
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

export function restoreReceiveSessionFromDisk(
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
