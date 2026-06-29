export interface BlobReceiveSession {
  workspaceId: string
  contentHash: string
  mimeType?: string
  sizeBytes: number
  totalChunks: number
  receivedCount: number
  peerDeviceId: string
  transferId: string
}

export const receiveSessions = new Map<string, BlobReceiveSession>()
export const pendingFetchResolvers = new Map<
  string,
  { resolve: (value: boolean) => void; reject: (error: Error) => void }
>()
export const inFlightFetches = new Set<string>()

export const MAX_CONCURRENT_BLOB_SENDS = 2
let activeBlobSends = 0
const blobSendWaiters: Array<() => void> = []

export async function acquireBlobSendSlot(): Promise<void> {
  if (activeBlobSends < MAX_CONCURRENT_BLOB_SENDS) {
    activeBlobSends += 1
    return
  }
  await new Promise<void>((resolve) => {
    blobSendWaiters.push(resolve)
  })
  activeBlobSends += 1
}

export function releaseBlobSendSlot(): void {
  activeBlobSends = Math.max(0, activeBlobSends - 1)
  const next = blobSendWaiters.shift()
  if (next) next()
}

export function getPendingBlobTransferCount(): number {
  return receiveSessions.size + inFlightFetches.size + activeBlobSends
}

export const DEFAULT_BLOB_REQUEST_TIMEOUT_MS = 60_000
export const SAVE_BLOB_REQUEST_TIMEOUT_MS = 25_000
export const BLOB_CONNECT_TIMEOUT_MS = 8_000
export const BLOB_PUSH_PEER_TIMEOUT_MS = 15_000

export type FetchBlobFromPeersOptions = {
  requestTimeoutMs?: number
  skipConnect?: boolean
  connectTimeoutMs?: number
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}
