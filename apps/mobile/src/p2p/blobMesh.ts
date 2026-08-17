import {
  chunkCountForSize,
  P2P_BLOB_CHUNK_SIZE,
  P2P_MOBILE_BLOB_MAX_BYTES,
} from '@toolman/shared'
import { b64ToBytes, bytesToB64, newUuid, sha256Hex } from './bytes'
import { emitMeshEvent } from './meshEvents'
import { encodeFileMessage, parseFileMessage } from './meshCodec'
import { getBlob, hasBlob, putBlob } from './blobStore'
import { sendFilesJson, type LiveMeshSession } from './session'

type ReceiveSession = {
  transferId: string
  workspaceId: string
  contentHash: string
  mimeType: string
  name?: string
  sizeBytes: number
  totalChunks: number
  parts: Map<number, Uint8Array>
}

const receiving = new Map<string, ReceiveSession>()

function startReceive(input: {
  transferId: string
  workspaceId: string
  contentHash: string
  mimeType?: string
  name?: string
  sizeBytes: number
  totalChunks: number
}): void {
  if (input.sizeBytes > P2P_MOBILE_BLOB_MAX_BYTES) return
  receiving.set(input.transferId, {
    ...input,
    mimeType: input.mimeType || 'application/octet-stream',
    parts: new Map(),
  })
}

async function finishReceive(transferId: string): Promise<void> {
  const session = receiving.get(transferId)
  if (!session) return
  receiving.delete(transferId)
  if (session.parts.size !== session.totalChunks) return
  const bytes = new Uint8Array(session.sizeBytes)
  let offset = 0
  for (let index = 0; index < session.totalChunks; index += 1) {
    const part = session.parts.get(index)
    if (!part) return
    bytes.set(part, offset)
    offset += part.length
  }
  const digest = await sha256Hex(bytes)
  if (digest !== session.contentHash) return
  putBlob({
    contentHash: session.contentHash,
    mimeType: session.mimeType,
    name: session.name,
    bytes,
  })
  emitMeshEvent({
    type: 'shared',
    workspaceId: session.workspaceId,
    item: {
      id: session.contentHash,
      name: session.name || session.contentHash.slice(0, 8),
      kind: 'knowledge',
      addedAt: Date.now(),
    },
  })
}

export async function handleFileChannelJson(_session: LiveMeshSession, raw: string): Promise<void> {
  const message = parseFileMessage(raw)
  if (!message) return
  switch (message.type) {
    case 'blob.not_found':
      receiving.delete(message.requestId)
      return
    case 'blob.meta':
      startReceive({
        transferId: message.requestId,
        workspaceId: message.workspaceId,
        contentHash: message.contentHash,
        mimeType: message.mimeType,
        sizeBytes: message.sizeBytes,
        totalChunks: message.totalChunks,
      })
      return
    case 'blob.push.start':
      startReceive({
        transferId: message.pushId,
        workspaceId: message.workspaceId,
        contentHash: message.contentHash,
        mimeType: message.mimeType,
        sizeBytes: message.sizeBytes,
        totalChunks: message.totalChunks,
      })
      return
    case 'blob.chunk':
    case 'blob.push.chunk': {
      const transferId = message.type === 'blob.chunk' ? message.requestId : message.pushId
      const current = receiving.get(transferId)
      if (!current) return
      current.parts.set(message.index, b64ToBytes(message.data))
      return
    }
    case 'blob.complete':
      await finishReceive(message.requestId)
      return
    case 'blob.push.complete':
      await finishReceive(message.pushId)
      return
    default:
      return
  }
}

export async function requestBlob(input: {
  workspaceId: string
  contentHash: string
  title?: string
}): Promise<void> {
  if (hasBlob(input.contentHash)) return
  const requestId = newUuid()
  await sendFilesJson(
    input.workspaceId,
    encodeFileMessage({
      type: 'blob.request',
      workspaceId: input.workspaceId,
      contentHash: input.contentHash,
      requestId,
    }),
  )
}

export async function pushLocalBlob(input: {
  workspaceId: string
  name: string
  mimeType: string
  bytes: Uint8Array
}): Promise<{ contentHash: string }> {
  if (input.bytes.byteLength > P2P_MOBILE_BLOB_MAX_BYTES) {
    throw new Error(`文件超过 ${Math.round(P2P_MOBILE_BLOB_MAX_BYTES / 1024 / 1024)}MB 限制`)
  }
  const contentHash = await sha256Hex(input.bytes)
  putBlob({
    contentHash,
    mimeType: input.mimeType,
    name: input.name,
    bytes: input.bytes,
  })
  const totalChunks = chunkCountForSize(input.bytes.byteLength, P2P_BLOB_CHUNK_SIZE)
  const pushId = newUuid()
  await sendFilesJson(
    input.workspaceId,
    encodeFileMessage({
      type: 'blob.push.start',
      pushId,
      workspaceId: input.workspaceId,
      contentHash,
      sizeBytes: input.bytes.byteLength,
      mimeType: input.mimeType,
      totalChunks,
    }),
  )
  for (let index = 0; index < totalChunks; index += 1) {
    const start = index * P2P_BLOB_CHUNK_SIZE
    const chunk = input.bytes.subarray(start, start + P2P_BLOB_CHUNK_SIZE)
    await sendFilesJson(
      input.workspaceId,
      encodeFileMessage({
        type: 'blob.push.chunk',
        pushId,
        contentHash,
        index,
        totalChunks,
        data: bytesToB64(chunk),
      }),
    )
  }
  await sendFilesJson(
    input.workspaceId,
    encodeFileMessage({
      type: 'blob.push.complete',
      pushId,
      contentHash,
    }),
  )
  return { contentHash }
}

export function getStoredBlob(contentHash: string) {
  return getBlob(contentHash)
}
