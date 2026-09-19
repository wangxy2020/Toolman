import { and, desc, eq } from 'drizzle-orm'
import type { ToolmanDatabase } from '../index.js'
import { knowledgeIndexVersions } from '../schema/knowledge.js'
import type { KnowledgeIndexVersionRow } from '../types/knowledge.js'

export interface CreateKnowledgeIndexVersionInput {
  id: string
  kbId: string
  version: number
  embeddingModel: string
  embeddingDimension: number
  chunkStrategy: string
  chunkSize: number
  chunkOverlap: number
  reranker?: string | null
  vectorBackend: string
  indexFingerprint?: string | null
  status?: KnowledgeIndexVersionRow['status']
}

export class KnowledgeIndexVersionRepository {
  constructor(private readonly db: ToolmanDatabase) {}

  listByKb(kbId: string): KnowledgeIndexVersionRow[] {
    return this.db
      .select()
      .from(knowledgeIndexVersions)
      .where(eq(knowledgeIndexVersions.kbId, kbId))
      .orderBy(desc(knowledgeIndexVersions.version))
      .all()
  }

  findByKbAndVersion(kbId: string, version: number): KnowledgeIndexVersionRow | null {
    return (
      this.db
        .select()
        .from(knowledgeIndexVersions)
        .where(
          and(eq(knowledgeIndexVersions.kbId, kbId), eq(knowledgeIndexVersions.version, version)),
        )
        .get() ?? null
    )
  }

  findActiveByKb(kbId: string): KnowledgeIndexVersionRow | null {
    return (
      this.db
        .select()
        .from(knowledgeIndexVersions)
        .where(and(eq(knowledgeIndexVersions.kbId, kbId), eq(knowledgeIndexVersions.status, 'active')))
        .get() ?? null
    )
  }

  findBuildingByKb(kbId: string): KnowledgeIndexVersionRow | null {
    return (
      this.db
        .select()
        .from(knowledgeIndexVersions)
        .where(
          and(eq(knowledgeIndexVersions.kbId, kbId), eq(knowledgeIndexVersions.status, 'building')),
        )
        .get() ?? null
    )
  }

  create(input: CreateKnowledgeIndexVersionInput): KnowledgeIndexVersionRow {
    const now = new Date()
    this.db
      .insert(knowledgeIndexVersions)
      .values({
        id: input.id,
        kbId: input.kbId,
        version: input.version,
        embeddingModel: input.embeddingModel,
        embeddingDimension: input.embeddingDimension,
        chunkStrategy: input.chunkStrategy,
        chunkSize: input.chunkSize,
        chunkOverlap: input.chunkOverlap,
        reranker: input.reranker ?? null,
        vectorBackend: input.vectorBackend,
        indexFingerprint: input.indexFingerprint ?? null,
        status: input.status ?? 'active',
        createdAt: now,
        activatedAt: input.status === 'active' || input.status == null ? now : null,
      })
      .run()
    return this.findByKbAndVersion(input.kbId, input.version)!
  }

  updateStatus(
    kbId: string,
    version: number,
    status: KnowledgeIndexVersionRow['status'],
    errorJson?: string | null,
  ): KnowledgeIndexVersionRow | null {
    const existing = this.findByKbAndVersion(kbId, version)
    if (!existing) return null
    const now = new Date()
    this.db
      .update(knowledgeIndexVersions)
      .set({
        status,
        errorJson: errorJson !== undefined ? errorJson : existing.errorJson,
        activatedAt: status === 'active' ? now : existing.activatedAt,
        retiredAt: status === 'retired' ? now : existing.retiredAt,
      })
      .where(
        and(eq(knowledgeIndexVersions.kbId, kbId), eq(knowledgeIndexVersions.version, version)),
      )
      .run()
    return this.findByKbAndVersion(kbId, version)
  }
}

export function createKnowledgeIndexVersionRepository(db: ToolmanDatabase) {
  return new KnowledgeIndexVersionRepository(db)
}
