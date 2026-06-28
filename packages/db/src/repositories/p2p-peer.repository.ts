import { and, eq } from 'drizzle-orm'
import type { ToolmanDatabase } from '../index.js'
import { p2pPeerNodes } from '../schema/p2p.js'
import type { P2pConnectionState, P2pPeerNodeRow } from '../types/p2p.js'

export interface UpsertP2pPeerInput {
  workspaceId: string
  deviceId: string
  displayName: string
  deviceName: string
  publicKey: string
  online?: boolean
  lastSeenAt?: Date
  connectionState?: P2pConnectionState | null
  trusted?: boolean
}

export class P2pPeerRepository {
  constructor(private readonly db: ToolmanDatabase) {}

  findByWorkspaceAndDevice(workspaceId: string, deviceId: string): P2pPeerNodeRow | null {
    return (
      this.db
        .select()
        .from(p2pPeerNodes)
        .where(
          and(eq(p2pPeerNodes.workspaceId, workspaceId), eq(p2pPeerNodes.deviceId, deviceId)),
        )
        .get() ?? null
    )
  }

  listByWorkspace(workspaceId: string): P2pPeerNodeRow[] {
    return this.db
      .select()
      .from(p2pPeerNodes)
      .where(eq(p2pPeerNodes.workspaceId, workspaceId))
      .all()
  }

  upsert(input: UpsertP2pPeerInput): P2pPeerNodeRow {
    const existing = this.findByWorkspaceAndDevice(input.workspaceId, input.deviceId)
    const now = new Date()

    if (existing) {
      this.db
        .update(p2pPeerNodes)
        .set({
          displayName: input.displayName ?? existing.displayName,
          deviceName: input.deviceName ?? existing.deviceName,
          publicKey: input.publicKey ?? existing.publicKey,
          online: input.online ?? existing.online,
          lastSeenAt: input.lastSeenAt ?? existing.lastSeenAt,
          connectionState:
            input.connectionState !== undefined
              ? input.connectionState
              : existing.connectionState,
          trusted: input.trusted ?? existing.trusted,
          updatedAt: now,
        })
        .where(
          and(
            eq(p2pPeerNodes.workspaceId, input.workspaceId),
            eq(p2pPeerNodes.deviceId, input.deviceId),
          ),
        )
        .run()
      return this.findByWorkspaceAndDevice(input.workspaceId, input.deviceId)!
    }

    this.db
      .insert(p2pPeerNodes)
      .values({
        workspaceId: input.workspaceId,
        deviceId: input.deviceId,
        displayName: input.displayName,
        deviceName: input.deviceName,
        publicKey: input.publicKey,
        online: input.online ?? false,
        lastSeenAt: input.lastSeenAt ?? null,
        connectionState: input.connectionState ?? null,
        trusted: input.trusted ?? false,
        createdAt: now,
        updatedAt: now,
      })
      .run()

    return this.findByWorkspaceAndDevice(input.workspaceId, input.deviceId)!
  }

  deleteByWorkspace(workspaceId: string): void {
    this.db.delete(p2pPeerNodes).where(eq(p2pPeerNodes.workspaceId, workspaceId)).run()
  }

  setTrusted(workspaceId: string, deviceId: string, trusted: boolean): P2pPeerNodeRow | null {
    const existing = this.findByWorkspaceAndDevice(workspaceId, deviceId)
    if (!existing) return null

    const now = new Date()
    this.db
      .update(p2pPeerNodes)
      .set({ trusted, updatedAt: now })
      .where(
        and(eq(p2pPeerNodes.workspaceId, workspaceId), eq(p2pPeerNodes.deviceId, deviceId)),
      )
      .run()

    return this.findByWorkspaceAndDevice(workspaceId, deviceId)
  }

  updateConnectionState(
    workspaceId: string,
    deviceId: string,
    connectionState: P2pConnectionState | null,
    online = false,
  ): P2pPeerNodeRow | null {
    const existing = this.findByWorkspaceAndDevice(workspaceId, deviceId)
    if (!existing) return null

    const now = new Date()
    this.db
      .update(p2pPeerNodes)
      .set({
        connectionState,
        online,
        lastSeenAt: online ? now : existing.lastSeenAt,
        updatedAt: now,
      })
      .where(
        and(eq(p2pPeerNodes.workspaceId, workspaceId), eq(p2pPeerNodes.deviceId, deviceId)),
      )
      .run()

    return this.findByWorkspaceAndDevice(workspaceId, deviceId)
  }
}
