import { blobExists, getBlobMeta } from '../blob.service'
import { parseFileChannelMessage, type FileChannelMessage } from './p2p-file-protocol'
import { canServeBlobToPeer } from './p2p-blob-peer-utils'
import { tryRecoverBlobFromSharedKnowledge } from './p2p-blob-recovery'
import {
  completeReceiveSession,
  handleIncomingChunk,
  startReceiveSession,
} from './p2p-blob-receive'
import { sendBlobToPeer } from './p2p-blob-send'
import { sendFileMessage } from './p2p-blob-file-messages'
import { pendingFetchResolvers } from './p2p-blob-transfer-state'

async function handleBlobRequest(
  peerDeviceId: string,
  message: Extract<FileChannelMessage, { type: 'blob.request' }>,
): Promise<void> {
  if (!canServeBlobToPeer(message.workspaceId, peerDeviceId)) {
    await sendFileMessage(peerDeviceId, {
      type: 'blob.not_found',
      requestId: message.requestId,
      contentHash: message.contentHash,
    })
    return
  }

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
