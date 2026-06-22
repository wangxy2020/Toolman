import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { hashFileBytes } from '@toolman/knowledge'
import { P2pMemberRepository } from '@toolman/db'
import { blobExists, readBlobBytes, writeBlobFromPath } from '../blob.service'
import { getDatabase } from '../../bootstrap/database'
import { getWorkspaceKnowledgeDir } from '../knowledge.service'
import { fetchBlobFromPeers } from './p2p-blob-transfer.service'

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

export async function ensureP2pKnowledgeBlobCached(input: {
  p2pWorkspaceId: string
  storageWorkspaceId: string
  kbId: string
  docId: string
  title: string
  contentHash: string
  mimeType: string
  sharedBy?: string | null
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

  if (!blobExists(input.contentHash)) {
    const memberRepo = new P2pMemberRepository(getDatabase())
    const sharer = input.sharedBy ? memberRepo.findById(input.sharedBy) : null
    const fetched = await fetchBlobFromPeers(
      input.p2pWorkspaceId,
      input.contentHash,
      input.mimeType,
      sharer?.deviceId,
    )
    if (!fetched) {
      return null
    }
  }

  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, readBlobBytes(input.contentHash))
  return filePath
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
