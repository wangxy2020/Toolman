import { randomUUID } from 'node:crypto'
import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm'
import {
  PmScheduleBaselineSchema,
  PmScheduleBaselineSnapshotSchema,
  parseVersionPlanSnapshotName,
  type PmScheduleBaseline,
  type PmScheduleBaselineSnapshot,
} from '@toolman/shared'
import type { ToolmanDatabase } from '../index.js'
import { pmScheduleBaselines } from '../schema/pm.js'

export type PmScheduleBaselineRow = typeof pmScheduleBaselines.$inferSelect

function parseSnapshot(raw: string): PmScheduleBaselineSnapshot {
  try {
    const parsed = JSON.parse(raw) as unknown
    return PmScheduleBaselineSnapshotSchema.parse(parsed)
  } catch {
    return { workItems: [], capturedAt: Date.now() }
  }
}

export function rowToPmScheduleBaseline(row: PmScheduleBaselineRow): PmScheduleBaseline {
  return PmScheduleBaselineSchema.parse({
    id: row.id,
    projectId: row.projectId,
    workspaceId: row.workspaceId,
    name: row.name,
    snapshot: parseSnapshot(row.snapshotJson),
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  })
}

function tryRowToPmScheduleBaseline(row: PmScheduleBaselineRow): PmScheduleBaseline | null {
  try {
    return rowToPmScheduleBaseline(row)
  } catch {
    return null
  }
}

export interface CreatePmScheduleBaselineInput {
  workspaceId: string
  projectId: string
  name: string
  snapshot: PmScheduleBaselineSnapshot
}

export class PmScheduleBaselineRepository {
  constructor(private readonly db: ToolmanDatabase) {}

  getById(id: string): PmScheduleBaseline | null {
    const row = this.db.select().from(pmScheduleBaselines).where(eq(pmScheduleBaselines.id, id)).get()
    if (!row || row.deletedAt) return null
    return rowToPmScheduleBaseline(row)
  }

  listByProject(projectId: string, workspaceId: string): PmScheduleBaseline[] {
    return this.db
      .select()
      .from(pmScheduleBaselines)
      .where(
        and(
          eq(pmScheduleBaselines.projectId, projectId),
          eq(pmScheduleBaselines.workspaceId, workspaceId),
          isNull(pmScheduleBaselines.deletedAt),
        ),
      )
      .orderBy(desc(pmScheduleBaselines.createdAt))
      .all()
      .map(tryRowToPmScheduleBaseline)
      .filter((entry): entry is PmScheduleBaseline => entry != null)
  }

  create(input: CreatePmScheduleBaselineInput): PmScheduleBaseline {
    const now = new Date()
    const id = randomUUID()
    const row: PmScheduleBaselineRow = {
      id,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      name: input.name,
      snapshotJson: JSON.stringify(input.snapshot),
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    }
    this.db.insert(pmScheduleBaselines).values(row).run()
    return rowToPmScheduleBaseline(row)
  }

  softDelete(id: string): boolean {
    const row = this.db.select().from(pmScheduleBaselines).where(eq(pmScheduleBaselines.id, id)).get()
    if (!row || row.deletedAt) return false
    this.db
      .update(pmScheduleBaselines)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(pmScheduleBaselines.id, id))
      .run()
    return true
  }

  /**
   * Newest soft-deleted version-plan snapshot for a schedule version
   * (reserved `__pm_version_plan__:N` or legacy `版本 N` / `Version N`).
   */
  findSoftDeletedVersionPlan(
    projectId: string,
    workspaceId: string,
    version: number,
  ): PmScheduleBaseline | null {
    const target = Math.floor(version)
    const rows = this.db
      .select()
      .from(pmScheduleBaselines)
      .where(
        and(
          eq(pmScheduleBaselines.projectId, projectId),
          eq(pmScheduleBaselines.workspaceId, workspaceId),
          isNotNull(pmScheduleBaselines.deletedAt),
        ),
      )
      .orderBy(desc(pmScheduleBaselines.createdAt))
      .all()
    for (const row of rows) {
      if (parseVersionPlanSnapshotName(row.name) === target) {
        return rowToPmScheduleBaseline(row)
      }
    }
    return null
  }

  /** Clear soft-delete (and optionally rename) so a version plan can be switched to again. */
  undelete(id: string, name?: string): PmScheduleBaseline | null {
    const row = this.db.select().from(pmScheduleBaselines).where(eq(pmScheduleBaselines.id, id)).get()
    if (!row) return null
    const now = new Date()
    this.db
      .update(pmScheduleBaselines)
      .set({
        deletedAt: null,
        updatedAt: now,
        ...(name != null && name.trim() ? { name: name.trim() } : {}),
      })
      .where(eq(pmScheduleBaselines.id, id))
      .run()
    return this.getById(id)
  }

  /** Replace snapshot contents in place (keeps id / createdAt). Optional rename. */
  updateSnapshot(
    id: string,
    snapshot: PmScheduleBaselineSnapshot,
    name?: string,
  ): PmScheduleBaseline | null {
    const row = this.db.select().from(pmScheduleBaselines).where(eq(pmScheduleBaselines.id, id)).get()
    if (!row || row.deletedAt) return null
    const now = new Date()
    this.db
      .update(pmScheduleBaselines)
      .set({
        snapshotJson: JSON.stringify(snapshot),
        ...(name != null && name.trim() ? { name: name.trim() } : {}),
        updatedAt: now,
      })
      .where(eq(pmScheduleBaselines.id, id))
      .run()
    return this.getById(id)
  }

  /** Revive a soft-deleted row and replace its snapshot (used when re-saving a version). */
  undeleteAndUpdateSnapshot(
    id: string,
    snapshot: PmScheduleBaselineSnapshot,
    name?: string,
  ): PmScheduleBaseline | null {
    const row = this.db.select().from(pmScheduleBaselines).where(eq(pmScheduleBaselines.id, id)).get()
    if (!row) return null
    const now = new Date()
    this.db
      .update(pmScheduleBaselines)
      .set({
        deletedAt: null,
        snapshotJson: JSON.stringify(snapshot),
        updatedAt: now,
        ...(name != null && name.trim() ? { name: name.trim() } : {}),
      })
      .where(eq(pmScheduleBaselines.id, id))
      .run()
    return this.getById(id)
  }

  upsertFromSync(baseline: PmScheduleBaseline): PmScheduleBaseline {
    const createdAt = new Date(baseline.createdAt)
    const updatedAt = new Date(baseline.updatedAt)
    const existing = this.db
      .select()
      .from(pmScheduleBaselines)
      .where(eq(pmScheduleBaselines.id, baseline.id))
      .get()
    const row: PmScheduleBaselineRow = {
      id: baseline.id,
      workspaceId: baseline.workspaceId,
      projectId: baseline.projectId,
      name: baseline.name,
      snapshotJson: JSON.stringify(baseline.snapshot),
      deletedAt: null,
      createdAt,
      updatedAt,
    }
    if (existing) {
      this.db.update(pmScheduleBaselines).set(row).where(eq(pmScheduleBaselines.id, baseline.id)).run()
    } else {
      this.db.insert(pmScheduleBaselines).values(row).run()
    }
    return rowToPmScheduleBaseline(row)
  }
}
