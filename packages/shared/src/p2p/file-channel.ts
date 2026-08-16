export const P2P_FILE_PROTOCOL_VERSION = 1
/** Raw bytes per chunk; base64 expands ~4/3× plus JSON wrapper — keep under ~64KB SCTP. */
export const P2P_BLOB_CHUNK_SIZE = 32 * 1024
/** Mobile receive/send cap so a phone is not filled by one transfer. */
export const P2P_MOBILE_BLOB_MAX_BYTES = 8 * 1024 * 1024

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

export function encodeFileChannelMessageJson(message: FileChannelMessage): string {
  return JSON.stringify({ v: P2P_FILE_PROTOCOL_VERSION, ...message })
}

export function parseFileChannelMessageJson(raw: string): FileChannelMessage | null {
  try {
    const parsed = JSON.parse(raw) as FileChannelMessage & { v?: number }
    if (!parsed || typeof parsed !== 'object' || typeof parsed.type !== 'string') {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function chunkCountForSize(sizeBytes: number, chunkSize = P2P_BLOB_CHUNK_SIZE): number {
  if (sizeBytes <= 0) return 0
  return Math.ceil(sizeBytes / chunkSize)
}
