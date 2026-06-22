export const P2P_FILE_PROTOCOL_VERSION = 1
/** Raw bytes per chunk; base64 + JSON + encryption must stay under WebRTC SCTP max (~64KB). */
export const P2P_BLOB_CHUNK_SIZE = 48 * 1024

export type FileChannelMessage =
  | {
      type: 'blob.request'
      v?: number
      workspaceId: string
      contentHash: string
      requestId: string
    }
  | {
      type: 'blob.not_found'
      v?: number
      requestId: string
      contentHash: string
    }
  | {
      type: 'blob.meta'
      v?: number
      requestId: string
      workspaceId: string
      contentHash: string
      sizeBytes: number
      mimeType?: string
      totalChunks: number
    }
  | {
      type: 'blob.chunk'
      v?: number
      requestId: string
      contentHash: string
      index: number
      totalChunks: number
      data: string
    }
  | {
      type: 'blob.complete'
      v?: number
      requestId: string
      contentHash: string
    }
  | {
      type: 'blob.push.start'
      v?: number
      pushId: string
      workspaceId: string
      contentHash: string
      sizeBytes: number
      mimeType?: string
      totalChunks: number
    }
  | {
      type: 'blob.push.chunk'
      v?: number
      pushId: string
      contentHash: string
      index: number
      totalChunks: number
      data: string
    }
  | {
      type: 'blob.push.complete'
      v?: number
      pushId: string
      contentHash: string
    }

export function encodeFileChannelMessage(message: FileChannelMessage): Buffer {
  return Buffer.from(JSON.stringify({ v: P2P_FILE_PROTOCOL_VERSION, ...message }), 'utf8')
}

export function parseFileChannelMessage(payload: Buffer): FileChannelMessage | null {
  try {
    const parsed = JSON.parse(payload.toString('utf8')) as FileChannelMessage & { v?: number }
    if (!parsed || typeof parsed !== 'object' || typeof parsed.type !== 'string') {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function chunkCountForSize(sizeBytes: number): number {
  if (sizeBytes <= 0) return 0
  return Math.ceil(sizeBytes / P2P_BLOB_CHUNK_SIZE)
}
