import {
  buildDocumentRevisionId,
  type KnowledgeDocument,
} from '@toolman/shared'
import { getDocumentRevisionRepository, getDocumentRepository } from '../db/repos'

export function recordReadyDocumentRevision(options: {
  documentId: string
  kbId: string
  contentHash: string | null
  parsedHash?: string | null
  indexFingerprint?: string | null
  indexVersion?: number
}): string {
  const revisions = getDocumentRevisionRepository()
  const docs = getDocumentRepository()
  const current = revisions.findCurrent(options.documentId)
  const sameContent = current?.contentHash === options.contentHash
  const sameIndex =
    (current?.indexFingerprint ?? null) === (options.indexFingerprint ?? null) &&
    (current?.indexVersion ?? 1) === (options.indexVersion ?? 1)
  if (current && sameContent && sameIndex) {
    return current.id
  }

  const nextNumber = (current?.revisionNumber ?? 0) + 1
  const revisionId = buildDocumentRevisionId(options.documentId, nextNumber)
  revisions.create({
    id: revisionId,
    documentId: options.documentId,
    kbId: options.kbId,
    revisionNumber: nextNumber,
    contentHash: options.contentHash,
    parsedHash: options.parsedHash ?? null,
    indexFingerprint: options.indexFingerprint ?? null,
    indexVersion: options.indexVersion ?? 1,
    isCurrent: 1,
  })
  revisions.markCurrent(options.documentId, revisionId)
  docs.update(options.documentId, options.kbId, {
    revisionNumber: nextNumber,
    currentRevisionId: revisionId,
    parsedHash: options.parsedHash ?? null,
    indexFingerprint: options.indexFingerprint ?? null,
    indexVersion: options.indexVersion ?? 1,
  })
  return revisionId
}

export function shouldSkipReadyDocumentForIndex(options: {
  existing: Pick<KnowledgeDocument, 'contentHash' | 'status'> & {
    indexFingerprint?: string | null
  }
  contentHash: string
  indexFingerprint?: string | null
}): boolean {
  if (options.existing.status !== 'ready') return false
  if (options.existing.contentHash !== options.contentHash) return false
  if (
    options.indexFingerprint &&
    options.existing.indexFingerprint &&
    options.existing.indexFingerprint !== options.indexFingerprint
  ) {
    return false
  }
  return true
}
