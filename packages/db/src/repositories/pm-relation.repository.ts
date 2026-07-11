import { randomUUID } from 'node:crypto'
import { and, desc, eq, isNull } from 'drizzle-orm'
import {
  PmWorkItemRelationSchema,
  type PmWorkItemRelation,
  type PmWorkItemRelationType,
} from '@toolman/shared'
import type { ToolmanDatabase } from '../index.js'
import { pmWorkItemRelations } from '../schema/pm.js'

export type PmWorkItemRelationRow = typeof pmWorkItemRelations.$inferSelect

export function rowToPmWorkItemRelation(row: PmWorkItemRelationRow): PmWorkItemRelation {
  return PmWorkItemRelationSchema.parse({
    id: row.id,
    projectId: row.projectId,
    workspaceId: row.workspaceId,
    fromWorkItemId: row.fromWorkItemId,
    toWorkItemId: row.toWorkItemId,
    type: row.type,
    lagDays: row.lagDays,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  })
}

export interface CreatePmWorkItemRelationInput {
  workspaceId: string
  projectId: string
  fromWorkItemId: string
  toWorkItemId: string
  type?: PmWorkItemRelationType
  lagDays?: number
}

export class PmWorkItemRelationRepository {
  constructor(private readonly db: ToolmanDatabase) {}

  getById(id: string): PmWorkItemRelation | null {
    const row = this.db
      .select()
      .from(pmWorkItemRelations)
      .where(eq(pmWorkItemRelations.id, id))
      .get()
    if (!row || row.deletedAt) return null
    return rowToPmWorkItemRelation(row)
  }

  listByProject(projectId: string, workspaceId: string): PmWorkItemRelation[] {
    return this.db
      .select()
      .from(pmWorkItemRelations)
      .where(
        and(
          eq(pmWorkItemRelations.projectId, projectId),
          eq(pmWorkItemRelations.workspaceId, workspaceId),
          isNull(pmWorkItemRelations.deletedAt),
        ),
      )
      .orderBy(desc(pmWorkItemRelations.updatedAt))
      .all()
      .map(rowToPmWorkItemRelation)
  }

  create(input: CreatePmWorkItemRelationInput): PmWorkItemRelation {
    const now = new Date()
    const id = randomUUID()
    const row: PmWorkItemRelationRow = {
      id,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      fromWorkItemId: input.fromWorkItemId,
      toWorkItemId: input.toWorkItemId,
      type: input.type ?? 'FS',
      lagDays: input.lagDays ?? 0,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    }
    this.db.insert(pmWorkItemRelations).values(row).run()
    return rowToPmWorkItemRelation(row)
  }

  softDelete(id: string): boolean {
    const row = this.db
      .select()
      .from(pmWorkItemRelations)
      .where(eq(pmWorkItemRelations.id, id))
      .get()
    if (!row || row.deletedAt) return false
    this.db
      .update(pmWorkItemRelations)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(pmWorkItemRelations.id, id))
      .run()
    return true
  }

  upsertFromSync(relation: PmWorkItemRelation): PmWorkItemRelation {
    const createdAt = new Date(relation.createdAt)
    const updatedAt = new Date(relation.updatedAt)
    const existing = this.db
      .select()
      .from(pmWorkItemRelations)
      .where(eq(pmWorkItemRelations.id, relation.id))
      .get()
    const row: PmWorkItemRelationRow = {
      id: relation.id,
      workspaceId: relation.workspaceId,
      projectId: relation.projectId,
      fromWorkItemId: relation.fromWorkItemId,
      toWorkItemId: relation.toWorkItemId,
      type: relation.type,
      lagDays: relation.lagDays,
      deletedAt: null,
      createdAt,
      updatedAt,
    }
    if (existing) {
      this.db.update(pmWorkItemRelations).set(row).where(eq(pmWorkItemRelations.id, relation.id)).run()
    } else {
      this.db.insert(pmWorkItemRelations).values(row).run()
    }
    return rowToPmWorkItemRelation(row)
  }
}
