import { z } from 'zod'

export const KNOWLEDGE_INDEX_STATUSES = [
  'building',
  'ready',
  'active',
  'failed',
  'retired',
] as const
export type KnowledgeIndexStatus = (typeof KNOWLEDGE_INDEX_STATUSES)[number]

export const KNOWLEDGE_HEALTH_STATUSES = ['healthy', 'warning', 'broken', 'stale'] as const
export type KnowledgeHealthStatus = (typeof KNOWLEDGE_HEALTH_STATUSES)[number]

export const KnowledgeIndexStatusSchema = z.enum(KNOWLEDGE_INDEX_STATUSES)
export const KnowledgeHealthStatusSchema = z.enum(KNOWLEDGE_HEALTH_STATUSES)

export const KnowledgeVisibilitySchema = z.enum(['private', 'workspace', 'shared'])
export type KnowledgeVisibility = z.infer<typeof KnowledgeVisibilitySchema>

export function buildKnowledgeIndexVersionId(kbId: string, version: number): string {
  return `${kbId}:idx:${version}`
}

export function buildDocumentRevisionId(documentId: string, revisionNumber: number): string {
  return `${documentId}:rev:${revisionNumber}`
}

export function buildKnowledgeIndexFingerprint(input: {
  chunkStrategy: string
  chunkSize: number
  chunkOverlap: number
  embeddingModel: string
  embeddingDimension: number
  vectorBackend: string
  reranker?: string | null
}): string {
  return [
    input.chunkStrategy,
    String(input.chunkSize),
    String(input.chunkOverlap),
    input.embeddingModel,
    String(input.embeddingDimension),
    input.vectorBackend,
    input.reranker ?? '',
  ].join('|')
}

export interface KnowledgeHealthFacts {
  status: string
  fileExists?: boolean | null
  contentHashMatches?: boolean | null
  chunkCount: number
  ftsCount?: number | null
  vectorCount?: number | null
  documentIndexVersion?: number | null
  activeIndexVersion?: number | null
  sourceValid?: boolean | null
  retrievalEnabled?: boolean
}

export interface KnowledgeHealthReport {
  status: KnowledgeHealthStatus
  reasons: string[]
}

function pushUnique(reasons: string[], reason: string): void {
  if (!reasons.includes(reason)) reasons.push(reason)
}

/**
 * Consistency check across original file, SQLite document/chunks, FTS, and vector index.
 * local_files rows should pass retrievalEnabled=false so missing vectors are not "broken".
 */
export function assessKnowledgeHealth(facts: KnowledgeHealthFacts): KnowledgeHealthReport {
  const reasons: string[] = []
  const retrievalEnabled = facts.retrievalEnabled !== false

  if (facts.status === 'stale') {
    pushUnique(reasons, 'document_stale')
  }
  if (facts.status === 'cancelled') {
    pushUnique(reasons, 'document_cancelled')
  }
  if (facts.status === 'failed') {
    pushUnique(reasons, 'document_failed')
  }
  if (facts.sourceValid === false || facts.fileExists === false) {
    pushUnique(reasons, 'source_missing')
  }
  if (facts.contentHashMatches === false) {
    pushUnique(reasons, 'content_hash_mismatch')
  }
  if (
    facts.documentIndexVersion != null &&
    facts.activeIndexVersion != null &&
    facts.documentIndexVersion !== facts.activeIndexVersion
  ) {
    pushUnique(reasons, 'index_version_mismatch')
  }

  if (facts.status === 'ready' && retrievalEnabled) {
    if (facts.chunkCount <= 0) pushUnique(reasons, 'chunks_missing')
    if (facts.ftsCount === 0) pushUnique(reasons, 'fts_missing')
    if (facts.vectorCount === 0) pushUnique(reasons, 'vector_missing')
  }

  if (reasons.includes('source_missing') || reasons.includes('document_failed')) {
    return { status: 'broken', reasons }
  }
  if (reasons.includes('chunks_missing') || reasons.includes('vector_missing')) {
    return { status: 'broken', reasons }
  }
  if (
    reasons.includes('document_stale') ||
    reasons.includes('content_hash_mismatch') ||
    reasons.includes('index_version_mismatch')
  ) {
    return { status: 'stale', reasons }
  }
  if (reasons.includes('fts_missing') || reasons.includes('document_cancelled')) {
    return { status: 'warning', reasons }
  }
  return { status: 'healthy', reasons }
}

export const KnowledgeUrlSnapshotSchema = z.object({
  sourceUrl: z.string().min(1),
  fetchedAt: z.number().int().nonnegative(),
  contentHash: z.string().min(1),
  httpStatus: z.number().int().optional(),
  etag: z.string().nullable().optional(),
  lastModified: z.string().nullable().optional(),
})

export type KnowledgeUrlSnapshot = z.infer<typeof KnowledgeUrlSnapshotSchema>
