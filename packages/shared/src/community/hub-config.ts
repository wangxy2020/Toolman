import { z } from 'zod'

export const OFFICIAL_TOOLMAN_HUB_URL = 'https://hub.toolman.app'

export const CommunityHubModeSchema = z.enum(['local', 'remote'])
export type CommunityHubMode = z.infer<typeof CommunityHubModeSchema>

export const CommunityHubConfigSchema = z.object({
  mode: CommunityHubModeSchema,
  baseUrl: z.string().url().optional(),
  /** F0: P2P federated catalog (community edition, default on). */
  federation: z
    .object({
      enabled: z.boolean().default(true),
    })
    .optional(),
  /** F1: peer Hub base URLs for HTTP catalog sync (enabled in PR2). */
  peers: z.array(z.string().url()).optional(),
  /** F1: preferred upstream Hub for incremental catalog sync (enabled in PR2). */
  upstream: z.string().url().optional(),
})
export type CommunityHubConfig = z.infer<typeof CommunityHubConfigSchema>

export function normalizeCommunityHubBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, '')
}
