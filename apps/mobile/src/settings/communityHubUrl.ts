import {
  DEFAULT_LOCAL_COMMUNITY_HUB_BASE_URL,
  listCommunityHubProbeCandidates,
  hostnameOfBaseUrl,
  isOfficialCommunityHubHost,
  normalizeSyncBaseUrl,
} from '@toolman/shared'

export const DEFAULT_COMMUNITY_HUB_BASE_URL = DEFAULT_LOCAL_COMMUNITY_HUB_BASE_URL

export function resolveCommunityHubBaseUrl(configured?: string | null): string {
  const trimmed = configured?.trim().replace(/\/+$/, '') ?? ''
  if (!trimmed || isOfficialCommunityHubHost(hostnameOfBaseUrl(trimmed))) {
    return DEFAULT_COMMUNITY_HUB_BASE_URL
  }
  return trimmed
}

export async function pickReachableCommunityHubBaseUrl(
  configured: string | null | undefined,
  probe: (url: string) => Promise<boolean>,
  options?: {
    packagerHostnames?: Array<string | null | undefined>
    includeLoopback?: boolean
    includeOfficialHub?: boolean
    officialHubFirst?: boolean
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
