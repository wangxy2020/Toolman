import { z } from 'zod'

/** Community edition (open source): P2P federation is on by default. */
export const CommunityFederationConfigSchema = z.object({
  federationEnabled: z.boolean().default(true),
  syncIntervalMs: z.number().int().positive().default(60_000),
  peerTimeoutMs: z.number().int().positive().default(15_000),
})
export type CommunityFederationConfig = z.infer<typeof CommunityFederationConfigSchema>
