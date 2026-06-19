import { randomUUID } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import type { ToolmanDatabase } from '../index.js'
import { p2pFileVersions } from '../schema/p2p.js'
import type { P2pFileVersionRow } from '../types/p2p.js'

export interface CreateP2pFileVersionInput {
  id?: string
  workspaceId: string
  sharedResourceId: string
  version: number
  contentHash: string
  sizeBytes: number
  mimeType?: string | null
  uploadedBy: string
  eventId?: string | null
  createdAt?: Date
}

export class P2pFileVersionRepository {
  constructor(private readonly db: ToolmanDatabase) {}

  findById(id: string): P2pFileVersionRow | null {
    return this.db.select().from(p2pFileVersions).where(eq(p2pFileVersions.id, id)).get() ?? null
  }

  findByResourceVersion(
    sharedResourceId: string,
    version: number,
  ): P2pFileVersionRow | null {
    return (
      this.db
        .select()
        .from(p2pFileVersions)
        .where(
          and(
            eq(p2pFileVersions.sharedResourceId, sharedResourceId),
            eq(p2pFileVersions.version, version),
          ),
        )
        .get() ?? null
    )
  }

  findLatestByResource(sharedResourceId: string): P2pFileVersionRow | null {
    return (
      this.db
        .select()
        .from(p2pFileVersions)
        .where(eq(p2pFileVersions.sharedResourceId, sharedResourceId))
        .orderBy(desc(p2pFileVersions.version))
        .limit(1)
        .get() ?? null
    )
  }

  listByResource(sharedResourceId: string): P2pFileVersionRow[] {
    return this.db
      .select()
      .from(p2pFileVersions)
      .where(eq(p2pFileVersions.sharedResourceId, sharedResourceId))
      .orderBy(desc(p2pFileVersions.version))
      .all()
  }

  create(input: CreateP2pFileVersionInput): P2pFileVersionRow {
    const id = input.id ?? randomUUID()
    const createdAt = input.createdAt ?? new Date()
    this.db
      .insert(p2pFileVersions)
      .values({
        id,
        workspaceId: input.workspaceId,
        sharedResourceId: input.sharedResourceId,
        version: input.version,
        contentHash: input.contentHash,
        sizeBytes: input.sizeBytes,
        mimeType: input.mimeType ?? null,
        uploadedBy: input.uploadedBy,
        eventId: input.eventId ?? null,
        createdAt,
      })
      .run()
    return this.findById(id)!
  }
}
