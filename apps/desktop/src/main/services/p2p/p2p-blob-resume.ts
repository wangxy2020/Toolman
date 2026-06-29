import { logStructured } from '../structured-log.service'
import { toErrorMessage } from '@toolman/shared'
import { P2pSharedResourceRepository } from '@toolman/db'
import { blobExists } from '../blob.service'
import { getDatabase } from '../../bootstrap/database'
import {
  deleteBlobReceiveSession,
  listBlobReceiveSessions,
} from './p2p-blob-session-store'
import { clearBlobChunkParts } from './p2p-blob-chunk-parts'
import { fetchBlobFromPeers } from './p2p-blob-fetch'
import {
  finalizeReceiveSession,
  restoreReceiveSessionFromDisk,
} from './p2p-blob-receive'
import { receiveSessions } from './p2p-blob-transfer-state'

export async function resumeInterruptedBlobTransfers(): Promise<void> {
  const restoredSummaries: string[] = []

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
    restoredSummaries.push(
      `${persisted.contentHash.slice(0, 8)} (${session.receivedCount}/${session.totalChunks})`,
    )
    void fetchBlobFromPeers(
      persisted.workspaceId,
      persisted.contentHash,
      persisted.mimeType,
      persisted.peerDeviceId,
    ).catch((error) => {
      logStructured('p2p', 'warn', `blob resume fetch failed for ${persisted.contentHash.slice(0, 8)}: ${toErrorMessage(error, 'blob resume fetch failed')}`)
    })
  }

  if (restoredSummaries.length > 0) {
    const unique = [...new Set(restoredSummaries)]
    const detail =
      unique.length === 1 ? unique[0]! : `${unique.length} unique blob(s)`
    logStructured(
      'p2p',
      'info',
      `restored ${restoredSummaries.length} partial blob receive session(s): ${detail}`,
    )
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
