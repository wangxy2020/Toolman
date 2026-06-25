import { toErrorMessage } from '@toolman/shared'
import { CommunityTaskItemSchema } from '@toolman/shared'

import { fromApiJson } from './community-case'
import {
  getCommunityHubStatus,
  getCommunityHttpClient,
  clearCommunityHubOfflineReadOnly,
  markCommunityHubOfflineReadOnly,
  refreshCommunityHubClientIfNeeded,
} from './community-bridge.service'
import {
  CommunityHttpError,
  isCommunityFetchNetworkError,
  type CommunityHttpClient,
} from './community-http.client'
import {
  readCommunityHubCache,
  writeCommunityHubCache,
} from './community-hub-cache.service'

export class CommunityHubUnavailableError extends Error {
  constructor() {
    super('Community hub is not running')
    this.name = 'CommunityHubUnavailableError'
  }
}

export function requireClient(): CommunityHttpClient {
  const client = getCommunityHttpClient()
  if (!client) {
    throw new CommunityHubUnavailableError()
  }
  return client
}

export async function withRefreshedHubClient<T>(
  operation: (client: CommunityHttpClient) => Promise<T>,
): Promise<T> {
  const run = async () => {
    await refreshCommunityHubClientIfNeeded()
    return operation(requireClient())
  }

  try {
    return await run()
  } catch (error) {
    const connectionFailure =
      isCommunityFetchNetworkError(error) ||
      (error instanceof CommunityHttpError && error.code === 'HUB_CONNECTION_FAILED')
    if (!connectionFailure) {
      throw error
    }
    await refreshCommunityHubClientIfNeeded()
    return run()
  }
}

function isTransientHubError(error: unknown): boolean {
  if (!(error instanceof CommunityHttpError)) return false
  return error.status === 429 || error.code === 'RATE_LIMITED'
}

export async function fetchWithHubCache<T>(
  cacheKey: string,
  fetch: (client: CommunityHttpClient) => Promise<T>,
): Promise<T> {
  const client = getCommunityHttpClient()
  if (!client) {
    const cached = readCommunityHubCache<T>(cacheKey)
    if (cached != null && getCommunityHubStatus().offlineReadOnly) {
      return cached
    }
    throw new CommunityHubUnavailableError()
  }

  try {
    const data = await fetch(client)
    writeCommunityHubCache(cacheKey, data)
    clearCommunityHubOfflineReadOnly()
    return data
  } catch (error) {
    const cached = readCommunityHubCache<T>(cacheKey)
    if (cached != null && !isTransientHubError(error)) {
      markCommunityHubOfflineReadOnly(toErrorMessage(error, String(error)))
      return cached
    }
    throw error
  }
}

export function asItems<T>(data: unknown): T[] {
  if (!Array.isArray(data)) return []
  return data.map((item) => fromApiJson<T>(item))
}

export function parseTaskItem(value: unknown) {
  const item = fromApiJson(value) as Record<string, unknown>

  if (Array.isArray(item.attachmentsJson)) {
    item.attachmentsJson = {}
  }

  return CommunityTaskItemSchema.parse(item)
}
