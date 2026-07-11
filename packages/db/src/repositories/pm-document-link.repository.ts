import { randomUUID } from 'node:crypto'
import { and, desc, eq, isNull } from 'drizzle-orm'
import {
  PmDocumentLinkSchema,
  type PmDocumentLink,
  type PmDocumentLinkType,
} from '@toolman/shared'
import type { ToolmanDatabase } from '../index.js'
import { pmDocumentLinks } from '../schema/pm.js'

export type PmDocumentLinkRow = typeof pmDocumentLinks.$inferSelect

function parseMetadata(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    return {}
  } catch {
    return {}
  }
}

export function rowToPmDocumentLink(row: PmDocumentLinkRow): PmDocumentLink {
  return PmDocumentLinkSchema.parse({
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId ?? undefined,
    workItemId: row.workItemId ?? undefined,
    knowledgeBaseId: row.knowledgeBaseId,
    knowledgeDocumentId: row.knowledgeDocumentId,
    linkType: row.linkType,
    titleOverride: row.titleOverride ?? undefined,
    metadata: parseMetadata(row.metadataJson),
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  })
}

export interface CreatePmDocumentLinkInput {
  workspaceId: string
  projectId?: string
  workItemId?: string
  knowledgeBaseId: string
  knowledgeDocumentId: string
  linkType?: PmDocumentLinkType
  titleOverride?: string
  metadata?: Record<string, unknown>
}

export class PmDocumentLinkRepository {
  constructor(private readonly db: ToolmanDatabase) {}

  getById(id: string): PmDocumentLink | null {
    const row = this.db.select().from(pmDocumentLinks).where(eq(pmDocumentLinks.id, id)).get()
    if (!row || row.deletedAt) return null
    return rowToPmDocumentLink(row)
  }

  list(options: {
    workspaceId: string
    projectId?: string
    workItemId?: string
    limit?: number
  }): PmDocumentLink[] {
    const conditions = [
      eq(pmDocumentLinks.workspaceId, options.workspaceId),
      isNull(pmDocumentLinks.deletedAt),
    ]
    if (options.projectId) {
      conditions.push(eq(pmDocumentLinks.projectId, options.projectId))
    }
    if (options.workItemId) {
      conditions.push(eq(pmDocumentLinks.workItemId, options.workItemId))
    }

    return this.db
      .select()
      .from(pmDocumentLinks)
      .where(and(...conditions))
      .orderBy(desc(pmDocumentLinks.updatedAt))
      .limit(options.limit ?? 500)
      .all()
      .map(rowToPmDocumentLink)
  }

  create(input: CreatePmDocumentLinkInput): PmDocumentLink {
    const now = new Date()
    const id = randomUUID()
    const row: PmDocumentLinkRow = {
      id,
      workspaceId: input.workspaceId,
      projectId: input.projectId ?? null,
      workItemId: input.workItemId ?? null,
      knowledgeBaseId: input.knowledgeBaseId,
      knowledgeDocumentId: input.knowledgeDocumentId,
      linkType: input.linkType ?? 'reference',
      titleOverride: input.titleOverride?.trim() || null,
      metadataJson: JSON.stringify(input.metadata ?? {}),
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    }
    this.db.insert(pmDocumentLinks).values(row).run()
    return rowToPmDocumentLink(row)
  }

  softDelete(id: string): boolean {
    const row = this.db.select().from(pmDocumentLinks).where(eq(pmDocumentLinks.id, id)).get()
    if (!row || row.deletedAt) return false
    this.db
      .update(pmDocumentLinks)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(pmDocumentLinks.id, id))
      .run()
    return true
  }

  upsertFromSync(link: PmDocumentLink): PmDocumentLink {
    const createdAt = new Date(link.createdAt)
    const updatedAt = new Date(link.updatedAt)
    const existing = this.db
      .select()
      .from(pmDocumentLinks)
      .where(eq(pmDocumentLinks.id, link.id))
      .get()
    const row: PmDocumentLinkRow = {
      id: link.id,
      workspaceId: link.workspaceId,
      projectId: link.projectId ?? null,
      workItemId: link.workItemId ?? null,
      knowledgeBaseId: link.knowledgeBaseId,
      knowledgeDocumentId: link.knowledgeDocumentId,
      linkType: link.linkType,
      titleOverride: link.titleOverride ?? null,
      metadataJson: JSON.stringify(link.metadata ?? {}),
      deletedAt: null,
      createdAt,
      updatedAt,
    }
    if (existing) {
      this.db.update(pmDocumentLinks).set(row).where(eq(pmDocumentLinks.id, link.id)).run()
    } else {
      this.db.insert(pmDocumentLinks).values(row).run()
    }
    return rowToPmDocumentLink(row)
  }
}
