import { randomUUID } from 'node:crypto'
import { and, desc, eq, isNull } from 'drizzle-orm'
import {
  PmProjectSchema,
  type PmDomain,
  type PmProject,
  type PmProjectStatus,
} from '@toolman/shared'
import type { ToolmanDatabase } from '../index.js'
import { pmProjects } from '../schema/pm.js'

export type PmProjectRow = typeof pmProjects.$inferSelect

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

export function rowToPmProject(row: PmProjectRow): PmProject {
  return PmProjectSchema.parse({
    id: row.id,
    workspaceId: row.workspaceId,
    code: row.code,
    name: row.name,
    status: row.status,
    domain: row.domain,
    workspaceRoot: row.workspaceRoot ?? undefined,
    description: row.description ?? undefined,
    metadata: parseMetadata(row.metadataJson),
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  })
}

export interface CreatePmProjectInput {
  workspaceId: string
  code: string
  name: string
  status?: PmProjectStatus
  domain: PmDomain
  workspaceRoot?: string
  description?: string
  metadata?: Record<string, unknown>
}

export interface UpdatePmProjectPatch {
  code?: string
  name?: string
  status?: PmProjectStatus
  domain?: PmDomain
  workspaceRoot?: string | null
  description?: string | null
  metadata?: Record<string, unknown>
}

export class PmProjectRepository {
  constructor(private readonly db: ToolmanDatabase) {}

  getById(id: string): PmProject | null {
    const row = this.db.select().from(pmProjects).where(eq(pmProjects.id, id)).get()
    if (!row || row.deletedAt) return null
    return rowToPmProject(row)
  }

  listByWorkspace(workspaceId: string, options?: { domain?: PmDomain; limit?: number }): PmProject[] {
    const conditions = [eq(pmProjects.workspaceId, workspaceId), isNull(pmProjects.deletedAt)]
    if (options?.domain) {
      conditions.push(eq(pmProjects.domain, options.domain))
    }
    return this.db
      .select()
      .from(pmProjects)
      .where(and(...conditions))
      .orderBy(desc(pmProjects.updatedAt))
      .limit(options?.limit ?? 200)
      .all()
      .map(rowToPmProject)
  }

  create(input: CreatePmProjectInput): PmProject {
    const now = new Date()
    const id = randomUUID()
    const row: PmProjectRow = {
      id,
      workspaceId: input.workspaceId,
      code: input.code.trim(),
      name: input.name.trim(),
      status: input.status ?? 'active',
      domain: input.domain,
      workspaceRoot: input.workspaceRoot?.trim() || null,
      description: input.description?.trim() || null,
      metadataJson: JSON.stringify(input.metadata ?? {}),
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    }
    this.db.insert(pmProjects).values(row).run()
    return rowToPmProject(row)
  }

  update(id: string, patch: UpdatePmProjectPatch): PmProject | null {
    const existing = this.getById(id)
    if (!existing) return null

    const now = new Date()
    const metadata =
      patch.metadata != null ? { ...existing.metadata, ...patch.metadata } : existing.metadata

    this.db
      .update(pmProjects)
      .set({
        code: patch.code?.trim() ?? existing.code,
        name: patch.name?.trim() ?? existing.name,
        status: patch.status ?? existing.status,
        domain: patch.domain ?? existing.domain,
        workspaceRoot:
          patch.workspaceRoot === null
            ? null
            : patch.workspaceRoot?.trim() ?? existing.workspaceRoot ?? null,
        description:
          patch.description === null
            ? null
            : patch.description?.trim() ?? existing.description ?? null,
        metadataJson: JSON.stringify(metadata),
        updatedAt: now,
      })
      .where(eq(pmProjects.id, id))
      .run()

    return this.getById(id)
  }

  softDelete(id: string): boolean {
    const existing = this.getById(id)
    if (!existing) return false
    this.db
      .update(pmProjects)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(pmProjects.id, id))
      .run()
    return true
  }

  upsertFromSync(project: import('@toolman/shared').PmProject): PmProject {
    const now = new Date(project.updatedAt)
    const createdAt = new Date(project.createdAt)
    const existing = this.db.select().from(pmProjects).where(eq(pmProjects.id, project.id)).get()
    const row: PmProjectRow = {
      id: project.id,
      workspaceId: project.workspaceId,
      code: project.code,
      name: project.name,
      status: project.status,
      domain: project.domain,
      workspaceRoot: project.workspaceRoot ?? null,
      description: project.description ?? null,
      metadataJson: JSON.stringify(project.metadata ?? {}),
      deletedAt: null,
      createdAt,
      updatedAt: now,
    }
    if (existing) {
      this.db.update(pmProjects).set(row).where(eq(pmProjects.id, project.id)).run()
    } else {
      this.db.insert(pmProjects).values(row).run()
    }
    return rowToPmProject(row)
  }
}
