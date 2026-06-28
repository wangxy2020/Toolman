import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq } from 'drizzle-orm'
import type { ToolmanDatabase } from '../index.js'
import { p2pSharedResources } from '../schema/p2p.js'
import type { P2pSharedResourceRow } from '../types/p2p.js'

export interface CreateP2pSharedResourceInput {
  id?: string
  workspaceId: string
  resourceType: P2pSharedResourceRow['resourceType']
  localResourceId?: string | null
  name: string
  sharedBy: string
  permission: P2pSharedResourceRow['permission']
  metadataJson?: string
  contentHash?: string | null
  version?: number
  status?: P2pSharedResourceRow['status']
  createdAt?: Date
  updatedAt?: Date
}

export interface UpdateP2pSharedResourceInput {
  id: string
  localResourceId?: string | null
  name?: string
  sharedBy?: string
  permission?: P2pSharedResourceRow['permission']
  contentHash?: string | null
  version?: number
  metadataJson?: string
  status?: P2pSharedResourceRow['status']
}

export class P2pSharedResourceRepository {
  constructor(private readonly db: ToolmanDatabase) {}

  findById(id: string): P2pSharedResourceRow | null {
    return this.db.select().from(p2pSharedResources).where(eq(p2pSharedResources.id, id)).get() ?? null
  }

  listFilesByWorkspace(workspaceId: string): P2pSharedResourceRow[] {
    return this.db
      .select()
      .from(p2pSharedResources)
      .where(
        and(
          eq(p2pSharedResources.workspaceId, workspaceId),
          eq(p2pSharedResources.resourceType, 'File'),
          eq(p2pSharedResources.status, 'active'),
        ),
      )
      .orderBy(desc(p2pSharedResources.updatedAt))
      .all()
  }

  listKnowledgeByWorkspace(workspaceId: string): P2pSharedResourceRow[] {
    return this.db
      .select()
      .from(p2pSharedResources)
      .where(
        and(
          eq(p2pSharedResources.workspaceId, workspaceId),
          eq(p2pSharedResources.resourceType, 'Knowledge'),
          eq(p2pSharedResources.status, 'active'),
        ),
      )
      .orderBy(desc(p2pSharedResources.updatedAt))
      .all()
  }

  findByWorkspaceAndLocalResource(
    workspaceId: string,
    localResourceId: string,
    resourceType: P2pSharedResourceRow['resourceType'],
  ): P2pSharedResourceRow | null {
    return (
      this.db
        .select()
        .from(p2pSharedResources)
        .where(
          and(
            eq(p2pSharedResources.workspaceId, workspaceId),
            eq(p2pSharedResources.localResourceId, localResourceId),
            eq(p2pSharedResources.resourceType, resourceType),
          ),
        )
        .get() ?? null
    )
  }

  listByWorkspace(workspaceId: string): P2pSharedResourceRow[] {
    return this.db
      .select()
      .from(p2pSharedResources)
      .where(eq(p2pSharedResources.workspaceId, workspaceId))
      .orderBy(asc(p2pSharedResources.createdAt))
      .all()
  }

  listActiveByLocalResource(
    localResourceId: string,
    resourceType: P2pSharedResourceRow['resourceType'],
  ): P2pSharedResourceRow[] {
    return this.db
      .select()
      .from(p2pSharedResources)
      .where(
        and(
          eq(p2pSharedResources.localResourceId, localResourceId),
          eq(p2pSharedResources.resourceType, resourceType),
          eq(p2pSharedResources.status, 'active'),
        ),
      )
      .all()
  }

  create(input: CreateP2pSharedResourceInput): P2pSharedResourceRow {
    const id = input.id ?? randomUUID()
    const now = input.createdAt ?? new Date()
    this.db
      .insert(p2pSharedResources)
      .values({
        id,
        workspaceId: input.workspaceId,
        resourceType: input.resourceType,
        localResourceId: input.localResourceId ?? null,
        name: input.name,
        sharedBy: input.sharedBy,
        permission: input.permission,
        metadataJson: input.metadataJson ?? '{}',
        contentHash: input.contentHash ?? null,
        version: input.version ?? 1,
        status: input.status ?? 'active',
        createdAt: now,
        updatedAt: input.updatedAt ?? now,
      })
      .run()
    return this.findById(id)!
  }

  update(input: UpdateP2pSharedResourceInput): P2pSharedResourceRow | null {
    const existing = this.findById(input.id)
    if (!existing) return null

    this.db
      .update(p2pSharedResources)
      .set({
        localResourceId:
          input.localResourceId === undefined ? existing.localResourceId : input.localResourceId,
        name: input.name ?? existing.name,
        sharedBy: input.sharedBy ?? existing.sharedBy,
        permission: input.permission ?? existing.permission,
        contentHash: input.contentHash === undefined ? existing.contentHash : input.contentHash,
        version: input.version ?? existing.version,
        metadataJson: input.metadataJson ?? existing.metadataJson,
        status: input.status ?? existing.status,
        updatedAt: new Date(),
      })
      .where(eq(p2pSharedResources.id, input.id))
      .run()

    return this.findById(input.id)
  }
}
