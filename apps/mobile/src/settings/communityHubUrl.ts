import {
  DEFAULT_LOCAL_COMMUNITY_HUB_BASE_URL,
  listCommunityHubProbeCandidates,
  normalizeSyncBaseUrl,
} from '@toolman/shared'

export const DEFAULT_COMMUNITY_HUB_BASE_URL = DEFAULT_LOCAL_COMMUNITY_HUB_BASE_URL

export function resolveCommunityHubBaseUrl(configured?: string | null): string {
  const trimmed = configured?.trim().replace(/\/+$/, '') ?? ''
  return trimmed || DEFAULT_COMMUNITY_HUB_BASE_URL
}

export async function pickReachableCommunityHubBaseUrl(
  configured: string | null | undefined,
  probe: (url: string) => Promise<boolean>,
  options?: {
    packagerHostnames?: Array<string | null | undefined>
    includeLoopback?: boolean
  },
): Promise<{ url: string; online: boolean; tried: string[] }> {
  const tried = listCommunityHubProbeCandidates(configured, options)
  for (const url of tried) {
    if (await probe(normalizeSyncBaseUrl(url))) {
      return { url: normalizeSyncBaseUrl(url), online: true, tried }
    }
  }
  return {
    url: resolveCommunityHubBaseUrl(configured),
    online: false,
    tried,
  }
}
