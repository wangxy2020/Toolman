import { z } from 'zod'

export const FederationPeeringInfoSchema = z.object({
  baseUrl: z.string().url(),
  version: z.string(),
  resourceCount: z.number().int().nonnegative(),
  latestUpdatedAt: z.number().int().nonnegative().optional(),
  federationPeering: z.boolean(),
})
export type FederationPeeringInfo = z.infer<typeof FederationPeeringInfoSchema>

export const FederationLibp2pBootstrapSchema = z.object({
  bootstrapMultiaddrs: z.array(z.string()),
})
export type FederationLibp2pBootstrap = z.infer<typeof FederationLibp2pBootstrapSchema>

export const FederationPeerSyncStateSchema = z.object({
  peerUrl: z.string().url(),
  updatedAfter: z.number().int().nonnegative().default(0),
  lastSyncedAt: z.number().int().nonnegative().optional(),
  lastError: z.string().optional(),
})
export type FederationPeerSyncState = z.infer<typeof FederationPeerSyncStateSchema>

export const FederationSyncStateStoreSchema = z.object({
  peers: z.array(FederationPeerSyncStateSchema).default([]),
  lastUpstreamSyncAt: z.number().int().nonnegative().optional(),
})
export type FederationSyncStateStore = z.infer<typeof FederationSyncStateStoreSchema>

export const DEFAULT_FEDERATION_SYNC_INTERVAL_MS = 60_000
export const DEFAULT_FEDERATION_PEER_TIMEOUT_MS = 15_000
