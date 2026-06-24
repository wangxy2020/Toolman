import { z } from 'zod'

export const OFFICIAL_TOOLMAN_HUB_URL = 'https://hub.toolman.app'

export const CommunityHubModeSchema = z.enum(['local', 'remote'])
export type CommunityHubMode = z.infer<typeof CommunityHubModeSchema>

export const CommunityHubConfigSchema = z.object({
  mode: CommunityHubModeSchema,
  baseUrl: z.string().url().optional(),
})
export type CommunityHubConfig = z.infer<typeof CommunityHubConfigSchema>

export function normalizeCommunityHubBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, '')
}
