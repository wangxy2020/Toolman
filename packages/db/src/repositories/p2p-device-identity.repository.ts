import { eq } from 'drizzle-orm'
import type { ToolmanDatabase } from '../index.js'
import { p2pDeviceIdentity } from '../schema/p2p.js'
import type { P2pDeviceIdentityRow } from '../types/p2p.js'

export interface UpsertP2pDeviceIdentityInput {
  deviceId: string
  identityId: string
  publicKey: string
  privateKeyRef: string
  createdAt: Date
}

export class P2pDeviceIdentityRepository {
  constructor(private readonly db: ToolmanDatabase) {}

  get(): P2pDeviceIdentityRow | null {
    return this.db.select().from(p2pDeviceIdentity).get() ?? null
  }

  getByDeviceId(deviceId: string): P2pDeviceIdentityRow | null {
    return (
      this.db
        .select()
        .from(p2pDeviceIdentity)
        .where(eq(p2pDeviceIdentity.deviceId, deviceId))
        .get() ?? null
    )
  }

  upsert(input: UpsertP2pDeviceIdentityInput): P2pDeviceIdentityRow {
    const existing = this.getByDeviceId(input.deviceId)
    if (existing) {
      this.db
        .update(p2pDeviceIdentity)
        .set({
          identityId: input.identityId,
          publicKey: input.publicKey,
          privateKeyRef: input.privateKeyRef,
        })
        .where(eq(p2pDeviceIdentity.deviceId, input.deviceId))
        .run()
      return this.getByDeviceId(input.deviceId)!
    }

    this.db
      .insert(p2pDeviceIdentity)
      .values({
        deviceId: input.deviceId,
        identityId: input.identityId,
        publicKey: input.publicKey,
        privateKeyRef: input.privateKeyRef,
        createdAt: input.createdAt,
      })
      .run()

    return this.getByDeviceId(input.deviceId)!
  }
}

export function createP2pDeviceIdentityRepository(db: ToolmanDatabase) {
  return new P2pDeviceIdentityRepository(db)
}
