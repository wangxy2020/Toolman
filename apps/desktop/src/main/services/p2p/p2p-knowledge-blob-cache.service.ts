import { existsSync, mkdirSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { hashFileBytes } from '@toolman/knowledge'
import { P2pMemberRepository, P2pWorkspaceRepository } from '@toolman/db'
import { blobExists, copyBlobToPath, writeBlobFromPath } from '../blob.service'
import { getDatabase } from '../../bootstrap/database'
import { getWorkspaceKnowledgeDir } from '../knowledge.service'
import {
  fetchBlobFromPeers,
  fetchKnowledgeBlobForSave,
} from './p2p-blob-transfer.service'
import { ensureMemberConnectsToOwner } from './p2p-member-reconcile.service'
import {
  ensureOwnerPeerTrustedForSync,
  trustPeerSilentlyForWorkspaceMesh,
} from './p2p-peer.service'
import { ensurePeerReadyForWorkspace, isPeerConnected } from './p2p-connection.service'

function extensionForTitle(title: string, mimeType: string): string {
  const fromTitle = extname(title)
  if (fromTitle) return fromTitle
  if (mimeType === 'application/pdf') return '.pdf'
  if (mimeType === 'text/plain') return '.txt'
  if (mimeType === 'text/markdown') return '.md'
  return ''
}

function sanitizeKnowledgeDocumentFileName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '文档'
  return trimmed.replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, ' ').trim()
}

export function buildSharedKnowledgeStoredFileName(
  docId: string,
  title: string,
  mimeType: string,
): string {
  const ext = extensionForTitle(title, mimeType)
  const baseName = sanitizeKnowledgeDocumentFileName(
    title.replace(/\.[^./\\]+$/i, '') || title,
  )
  if (baseName && ext && !baseName.toLowerCase().endsWith(ext.toLowerCase())) {
    return `${baseName}${ext}`
  }
  if (baseName) return baseName
  return `${docId}${ext}`
}

export function resolveP2pKnowledgeBlobCachePath(input: {
  storageWorkspaceId: string
  p2pWorkspaceId: string
  kbId: string
  fileName: string
}): string {
  return join(
    getWorkspaceKnowledgeDir(input.storageWorkspaceId),
    'p2p-sync',
    input.p2pWorkspaceId,
    input.kbId,
    input.fileName,
  )
}

function ensureLocalBlobFromPath(path: string, contentHash: string): boolean {
  if (!existsSync(path)) return false
  try {
    if (hashFileBytes(path) !== contentHash) return false
    if (!blobExists(contentHash)) {
      writeBlobFromPath(path)
    }
    return blobExists(contentHash)
  } catch {
    return false
  }
}

function writeCachedKnowledgeBlobFile(
  input: {
    storageWorkspaceId: string
    p2pWorkspaceId: string
    kbId: string
    docId: string
    title: string
    contentHash: string
    mimeType: string
  },
): string | null {
  if (!blobExists(input.contentHash)) {
    return null
  }

  const fileName = buildSharedKnowledgeStoredFileName(input.docId, input.title, input.mimeType)
  const filePath = resolveP2pKnowledgeBlobCachePath({
    storageWorkspaceId: input.storageWorkspaceId,
    p2pWorkspaceId: input.p2pWorkspaceId,
    kbId: input.kbId,
    fileName,
  })

  mkdirSync(dirname(filePath), { recursive: true })
  copyBlobToPath(input.contentHash, filePath)
  return filePath
}

export async function ensureP2pKnowledgeBlobCached(input: {
  p2pWorkspaceId: string
  storageWorkspaceId: string
  kbId: string
  docId: string
  title: string
  contentHash: string
  mimeType: string
  sharedBy?: string | null
  allowNetworkFetch?: boolean
}): Promise<string | null> {
  const fileName = buildSharedKnowledgeStoredFileName(input.docId, input.title, input.mimeType)
  const filePath = resolveP2pKnowledgeBlobCachePath({
    storageWorkspaceId: input.storageWorkspaceId,
    p2pWorkspaceId: input.p2pWorkspaceId,
    kbId: input.kbId,
    fileName,
  })

  if (existsSync(filePath)) {
    try {
      if (hashFileBytes(filePath) === input.contentHash) {
        if (!blobExists(input.contentHash)) {
          writeBlobFromPath(filePath)
        }
        return filePath
      }
    } catch {
      // rewrite below
    }
  }

  if (ensureLocalBlobFromPath(filePath, input.contentHash)) {
    return filePath
  }

  if (input.allowNetworkFetch === false || blobExists(input.contentHash)) {
    return writeCachedKnowledgeBlobFile(input)
  }

  const memberRepo = new P2pMemberRepository(getDatabase())
  const sharer = input.sharedBy ? memberRepo.findById(input.sharedBy) : null
  const fetched = await fetchBlobFromPeers(
    input.p2pWorkspaceId,
    input.contentHash,
    input.mimeType,
    sharer?.deviceId,
    { skipConnect: true, requestTimeoutMs: 15_000 },
  )
  if (!fetched) {
    return null
  }

  return writeCachedKnowledgeBlobFile(input)
}

async function prepareKnowledgeBlobFetch(
  p2pWorkspaceId: string,
  sharedByMemberId?: string | null,
): Promise<string | undefined> {
  const db = getDatabase()
  const workspace = new P2pWorkspaceRepository(db).findById(p2pWorkspaceId)
  const ownerDeviceId = workspace?.ownerDeviceId
  const sharerMember = sharedByMemberId
    ? new P2pMemberRepository(db).findById(sharedByMemberId)
    : null

  if (ownerDeviceId) {
    ensureOwnerPeerTrustedForSync(p2pWorkspaceId, ownerDeviceId)
  }
  if (sharerMember?.deviceId) {
    trustPeerSilentlyForWorkspaceMesh(
      p2pWorkspaceId,
      sharerMember.deviceId,
      sharerMember.displayName,
    )
  }

  await Promise.race([
    ensureMemberConnectsToOwner(p2pWorkspaceId, { immediate: true }),
    new Promise<void>((resolve) => {
      setTimeout(resolve, 10_000)
    }),
  ])

  const preferredPeerDeviceId = sharerMember?.deviceId ?? ownerDeviceId
  if (preferredPeerDeviceId && !isPeerConnected(preferredPeerDeviceId)) {
    await Promise.race([
      ensurePeerReadyForWorkspace(preferredPeerDeviceId, p2pWorkspaceId).catch(() => undefined),
      new Promise<void>((resolve) => {
        setTimeout(resolve, 8_000)
      }),
    ])
  }

  return preferredPeerDeviceId
}

export async function fetchAndCacheSharedKnowledgeBlob(input: {
  p2pWorkspaceId: string
  storageWorkspaceId: string
  kbId: string
  docId: string
  title: string
  contentHash: string
  mimeType: string
  sharedBy?: string | null
}): Promise<string | null> {
  const cached = await ensureP2pKnowledgeBlobCached({
    ...input,
    allowNetworkFetch: false,
  })
  if (cached) {
    return cached
  }

  const preferredPeerDeviceId = await prepareKnowledgeBlobFetch(
    input.p2pWorkspaceId,
    input.sharedBy,
  )

  const workspace = new P2pWorkspaceRepository(getDatabase()).findById(input.p2pWorkspaceId)
  const fetchTargets = [
    preferredPeerDeviceId,
    workspace?.ownerDeviceId,
  ].filter((id, index, list): id is string => Boolean(id) && list.indexOf(id) === index)

  for (const fetchTarget of fetchTargets) {
    if (blobExists(input.contentHash)) break
    await fetchKnowledgeBlobForSave(
      input.p2pWorkspaceId,
      input.contentHash,
      input.mimeType,
      fetchTarget,
    )
  }

  if (!blobExists(input.contentHash)) {
    await fetchBlobFromPeers(
      input.p2pWorkspaceId,
      input.contentHash,
      input.mimeType,
      undefined,
      { requestTimeoutMs: 25_000 },
    )
  }

  return ensureP2pKnowledgeBlobCached({
    ...input,
    allowNetworkFetch: false,
  })
}

export function isP2pKnowledgeBlobCached(input: {
  storageWorkspaceId: string
  p2pWorkspaceId: string
  kbId: string
  docId: string
  title: string
  contentHash: string
  mimeType: string
}): boolean {
  const fileName = buildSharedKnowledgeStoredFileName(input.docId, input.title, input.mimeType)
  const filePath = resolveP2pKnowledgeBlobCachePath({
    storageWorkspaceId: input.storageWorkspaceId,
    p2pWorkspaceId: input.p2pWorkspaceId,
    kbId: input.kbId,
    fileName,
  })
  if (!existsSync(filePath)) return false
  try {
    return hashFileBytes(filePath) === input.contentHash
  } catch {
    return false
  }
}
