import { logStructured } from '../structured-log.service'
import { toErrorMessage } from '@toolman/shared'
import { randomUUID } from 'node:crypto'
import { blobExists } from '../blob.service'
import {
  ensurePeerReadyForWorkspace,
  isPeerConnected,
  listP2pConnections,
} from './p2p-connection.service'
import { getP2pDeviceInfo } from './p2p-device-identity.service'
import { broadcastP2pSyncCompleted } from './p2p-sync-broadcast'
import { sendFileMessage } from './p2p-blob-file-messages'
import {
  canRequestBlobFromPeer,
  listActiveWorkspacePeerIds,
  listBlobFetchPeerCandidates,
  waitForBlob,
} from './p2p-blob-peer-utils'
import { sendBlobToPeer } from './p2p-blob-send'
import {
  BLOB_CONNECT_TIMEOUT_MS,
  BLOB_PUSH_PEER_TIMEOUT_MS,
  DEFAULT_BLOB_REQUEST_TIMEOUT_MS,
  inFlightFetches,
  pendingFetchResolvers,
  receiveSessions,
  SAVE_BLOB_REQUEST_TIMEOUT_MS,
  sleep,
  type FetchBlobFromPeersOptions,
} from './p2p-blob-transfer-state'

async function requestBlobFromPeer(
  workspaceId: string,
  peerDeviceId: string,
  contentHash: string,
  mimeType?: string,
  requestTimeoutMs = DEFAULT_BLOB_REQUEST_TIMEOUT_MS,
): Promise<boolean> {
  if (!canRequestBlobFromPeer(workspaceId, peerDeviceId)) {
    logStructured(
      'p2p',
      'warn',
      `blob request skipped for ${peerDeviceId.slice(0, 8)}: peer not authorized in ${workspaceId.slice(0, 8)}`,
    )
    return false
  }

  if (!isPeerConnected(peerDeviceId)) {
    return false
  }

  const requestId = randomUUID()
  const result = await new Promise<boolean>((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingFetchResolvers.delete(requestId)
      receiveSessions.delete(requestId)
      resolve(false)
    }, requestTimeoutMs)

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
  options?: FetchBlobFromPeersOptions,
): Promise<boolean> {
  if (!contentHash || blobExists(contentHash)) {
    return true
  }

  const fetchKey = `${workspaceId}:${contentHash}`
  if (inFlightFetches.has(fetchKey)) {
    return waitForBlob(contentHash, options?.requestTimeoutMs ?? DEFAULT_BLOB_REQUEST_TIMEOUT_MS)
  }
  inFlightFetches.add(fetchKey)

  try {
    let connections = await listP2pConnections()
    const peerOrder = listBlobFetchPeerCandidates(
      workspaceId,
      preferredPeerDeviceId,
      connections,
    )
    const requestTimeoutMs = options?.requestTimeoutMs ?? DEFAULT_BLOB_REQUEST_TIMEOUT_MS
    const connectTimeoutMs = options?.connectTimeoutMs ?? BLOB_CONNECT_TIMEOUT_MS

    for (const peerDeviceId of peerOrder) {
      try {
        if (!isPeerConnected(peerDeviceId)) {
          if (options?.skipConnect) {
            continue
          }
          await Promise.race([
            ensurePeerReadyForWorkspace(peerDeviceId, workspaceId).catch(() => undefined),
            sleep(connectTimeoutMs),
          ])
          connections = await listP2pConnections()
          if (!isPeerConnected(peerDeviceId)) {
            continue
          }
        }

        const ok = await requestBlobFromPeer(
          workspaceId,
          peerDeviceId,
          contentHash,
          mimeType,
          requestTimeoutMs,
        )
        if (ok && blobExists(contentHash)) {
          return true
        }
      } catch (error) {
        const message = toErrorMessage(error, String(error))
        logStructured('p2p', 'warn', `blob fetch from ${peerDeviceId.slice(0, 8)} failed: ${message}`)
      }
    }

    return blobExists(contentHash)
  } finally {
    inFlightFetches.delete(fetchKey)
  }
}

export async function fetchKnowledgeBlobForSave(
  workspaceId: string,
  contentHash: string,
  mimeType: string | undefined,
  preferredPeerDeviceId: string | undefined,
): Promise<boolean> {
  return fetchBlobFromPeers(workspaceId, contentHash, mimeType, preferredPeerDeviceId, {
    requestTimeoutMs: SAVE_BLOB_REQUEST_TIMEOUT_MS,
    connectTimeoutMs: BLOB_CONNECT_TIMEOUT_MS,
  })
}

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
      if (!canRequestBlobFromPeer(workspaceId, peer.peerDeviceId)) return
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
