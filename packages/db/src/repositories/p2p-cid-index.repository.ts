import { and, eq } from 'drizzle-orm'
import type { ToolmanDatabase } from '../index.js'
import { p2pCidIndex } from '../schema/p2p.js'
import type { P2pCidIndexRow } from '../types/p2p.js'

export interface UpsertP2pCidIndexInput {
  cid: string
  rootCid: string
  packageId?: string | null
  resourceId?: string | null
  resourceType?: string | null
  version?: string | null
  localPath: string
  chunkIndex: number
  sizeBytes: number
  createdAt?: Date
  updatedAt?: Date
}

export class P2pCidIndexRepository {
  constructor(private readonly db: ToolmanDatabase) {}

  upsert(input: UpsertP2pCidIndexInput): P2pCidIndexRow {
    const now = input.updatedAt ?? new Date()
    const createdAt = input.createdAt ?? now

    this.db
      .insert(p2pCidIndex)
      .values({
        cid: input.cid,
        rootCid: input.rootCid,
        packageId: input.packageId ?? null,
        resourceId: input.resourceId ?? null,
        resourceType: input.resourceType ?? null,
        version: input.version ?? null,
        localPath: input.localPath,
        chunkIndex: input.chunkIndex,
        sizeBytes: input.sizeBytes,
        createdAt,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: p2pCidIndex.cid,
        set: {
          rootCid: input.rootCid,
          packageId: input.packageId ?? null,
          resourceId: input.resourceId ?? null,
          resourceType: input.resourceType ?? null,
          version: input.version ?? null,
          localPath: input.localPath,
          chunkIndex: input.chunkIndex,
          sizeBytes: input.sizeBytes,
          updatedAt: now,
        },
      })
      .run()

    return this.findByCid(input.cid)!
  }

  findByCid(cid: string): P2pCidIndexRow | null {
    return this.db.select().from(p2pCidIndex).where(eq(p2pCidIndex.cid, cid)).get() ?? null
  }

  listByRootCid(rootCid: string): P2pCidIndexRow[] {
    return this.db
      .select()
      .from(p2pCidIndex)
      .where(eq(p2pCidIndex.rootCid, rootCid))
      .all()
      .sort((left, right) => left.chunkIndex - right.chunkIndex)
  }

  findPackageByResource(resourceId: string, version: string): P2pCidIndexRow | null {
    return (
      this.db
        .select()
        .from(p2pCidIndex)
        .where(
          and(
            eq(p2pCidIndex.resourceId, resourceId),
            eq(p2pCidIndex.version, version),
            eq(p2pCidIndex.chunkIndex, -1),
          ),
        )
        .limit(1)
        .get() ?? null
    )
  }

  findLatestRootByResource(resourceId: string): P2pCidIndexRow | null {
    const rows = this.db
      .select()
      .from(p2pCidIndex)
      .where(and(eq(p2pCidIndex.resourceId, resourceId), eq(p2pCidIndex.chunkIndex, -1)))
      .all()

    return rows.sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())[0] ?? null
  }

  countAll(): number {
    return this.db.select().from(p2pCidIndex).all().length
  }

  countDistinctRoots(): number {
    const rows = this.db.select({ rootCid: p2pCidIndex.rootCid }).from(p2pCidIndex).all()
    return new Set(rows.map((row) => row.rootCid)).size
  }
}
