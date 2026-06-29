import { statSync } from 'node:fs'
import { open } from 'node:fs/promises'
import { getBlobStoragePath } from '../blob.service'
import {
  chunkCountForSize,
  P2P_BLOB_CHUNK_SIZE,
  type FileChannelMessage,
} from './p2p-file-protocol'
import { broadcastFileProgress, sendFileMessage } from './p2p-blob-file-messages'
import {
  acquireBlobSendSlot,
  releaseBlobSendSlot,
} from './p2p-blob-transfer-state'

export async function sendBlobToPeer(
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
    const metaMessage: FileChannelMessage =
      mode === 'request'
        ? {
            type: 'blob.meta',
            requestId: transferId,
            workspaceId,
            contentHash,
            sizeBytes,
            mimeType,
            totalChunks,
          }
        : {
            type: 'blob.push.start',
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
      const chunkMessage: FileChannelMessage =
        mode === 'request'
          ? {
              type: 'blob.chunk',
              requestId: transferId,
              contentHash,
              index,
              totalChunks,
              data: chunk.toString('base64'),
            }
          : {
              type: 'blob.push.chunk',
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
