const DEFAULT_TTL_MS = 30_000

interface CacheEntry<T> {
  data: T
  fetchedAt: number
}

const cache = new Map<string, CacheEntry<unknown>>()
const inflight = new Map<string, Promise<unknown>>()

export function readCommunityListCache<T>(key: string, maxAgeMs = DEFAULT_TTL_MS): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined
  if (!entry) return null
  if (Date.now() - entry.fetchedAt > maxAgeMs) return null
  return entry.data
}

export function writeCommunityListCache<T>(key: string, data: T): void {
  cache.set(key, { data, fetchedAt: Date.now() })
}

export function invalidateCommunityListCache(keyPrefix?: string): void {
  if (!keyPrefix) {
    cache.clear()
    return
  }
  for (const key of cache.keys()) {
    if (key.startsWith(keyPrefix)) {
      cache.delete(key)
    }
  }
}

export async function fetchCommunityListCached<T>(
  key: string,
  fetcher: () => Promise<T>,
  options?: { force?: boolean; maxAgeMs?: number },
): Promise<T> {
  const maxAgeMs = options?.maxAgeMs ?? DEFAULT_TTL_MS
  if (!options?.force) {
    const cached = readCommunityListCache<T>(key, maxAgeMs)
    if (cached != null) {
      return cached
    }
  }

  const pending = inflight.get(key) as Promise<T> | undefined
  if (pending) {
    return pending
  }

  const promise = fetcher()
    .then((data) => {
      writeCommunityListCache(key, data)
      return data
    })
    .finally(() => {
      inflight.delete(key)
    })

  inflight.set(key, promise)
  return promise
}
