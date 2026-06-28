import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  CommunityResourceItemSchema,
  FederatedResourceCatalogEntrySchema,
  type CidPackageManifest,
  type CommunityResourceItem,
  type CommunityResourceListInput,
  type CommunityResourceType,
  type FederatedResourceCatalogEntry,
} from '@toolman/shared'

import { getCommunityDataDir } from './community-paths'
import { broadcastFederatedCatalogUpdate } from './community-federation-broadcast'

const CATALOG_FILE = 'federated-catalog.json'

interface FederatedCatalogStore {
  entries: StoredFederatedCatalogEntry[]
}

interface StoredFederatedCatalogEntry extends FederatedResourceCatalogEntry {
  source?: 'p2p' | 'hub-peer'
  peerHubUrl?: string
  /** How the row entered the local catalog. CID announce fallbacks are not marketplace listings. */
  origin?: 'catalog' | 'hub-peer' | 'cid-fallback'
}

function isLegacyCidFallbackEntry(entry: StoredFederatedCatalogEntry): boolean {
  if (entry.origin === 'catalog' || entry.origin === 'hub-peer') return false
  if (entry.origin === 'cid-fallback') return true
  const title = entry.title.trim()
  return entry.description === '' && (title === entry.id || /^[0-9a-f-]{36}$/i.test(title))
}

function isMarketplaceFederatedEntry(entry: StoredFederatedCatalogEntry): boolean {
  return !isLegacyCidFallbackEntry(entry)
}

let cache: Map<string, StoredFederatedCatalogEntry> | null = null

function getCatalogPath(): string {
  const dir = getCommunityDataDir()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return join(dir, CATALOG_FILE)
}

function loadStore(): Map<string, StoredFederatedCatalogEntry> {
  if (cache) return cache

  const map = new Map<string, StoredFederatedCatalogEntry>()
  const path = getCatalogPath()
  if (!existsSync(path)) {
    cache = map
    return map
  }

  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as FederatedCatalogStore
    let removedLegacy = false
    for (const entry of parsed.entries ?? []) {
      const validated = FederatedResourceCatalogEntrySchema.safeParse(entry)
      if (validated.success) {
        const stored = entry as StoredFederatedCatalogEntry
        const normalized: StoredFederatedCatalogEntry = {
          ...validated.data,
          source: stored.source,
          peerHubUrl: stored.peerHubUrl,
          origin: stored.origin,
        }
        if (!isMarketplaceFederatedEntry(normalized)) {
          removedLegacy = true
          continue
        }
        map.set(validated.data.id, normalized)
      }
    }
    if (removedLegacy) {
      persistStore(map)
    }
  } catch {
    // ignore corrupt catalog file
  }

  cache = map
  return map
}

function persistStore(map: Map<string, StoredFederatedCatalogEntry>): void {
  const payload: FederatedCatalogStore = {
    entries: [...map.values()].sort((left, right) => right.updatedAt - left.updatedAt),
  }
  writeFileSync(getCatalogPath(), JSON.stringify(payload, null, 2), 'utf8')
  cache = map
}

export function upsertFederatedCatalogEntry(
  entry: FederatedResourceCatalogEntry,
  options?: {
    source?: 'p2p' | 'hub-peer'
    peerHubUrl?: string
    origin?: StoredFederatedCatalogEntry['origin']
  },
): boolean {
  const validated = FederatedResourceCatalogEntrySchema.parse(entry)
  const origin = options?.origin ?? (options?.source === 'hub-peer' ? 'hub-peer' : 'catalog')
  if (origin === 'cid-fallback') {
    return false
  }
  const map = loadStore()
  const existing = map.get(validated.id)
  if (existing && existing.updatedAt > validated.updatedAt) {
    return false
  }

  map.set(validated.id, {
    ...validated,
    source: options?.source ?? existing?.source ?? 'p2p',
    peerHubUrl: options?.peerHubUrl ?? existing?.peerHubUrl,
    origin,
  })
  persistStore(map)
  if ((options?.source ?? existing?.source ?? 'p2p') === 'p2p') {
    broadcastFederatedCatalogUpdate({ action: 'upsert', entry: validated })
  }
  return true
}

export function buildFederatedCatalogEntryFromResource(
  resource: CommunityResourceItem,
  rootCid: string,
): FederatedResourceCatalogEntry {
  return FederatedResourceCatalogEntrySchema.parse({
    id: resource.id,
    title: resource.title,
    description: resource.description,
    author: resource.author,
    version: resource.version,
    tags: resource.tags,
    category: resource.category,
    resourceType: resource.resourceType,
    resourceSize: resource.resourceSize,
    rootCid,
    license: resource.license,
    createdAt: resource.createdAt,
    updatedAt: resource.updatedAt,
  })
}

export function upsertFederatedCatalogFromCidManifest(
  _manifest: CidPackageManifest,
  _signerDid: string,
): boolean {
  // CID announce is for package distribution only — never add marketplace list rows.
  return false
}

function toCommunityResourceItem(entry: StoredFederatedCatalogEntry): CommunityResourceItem {
  return CommunityResourceItemSchema.parse({
    id: entry.id,
    title: entry.title,
    description: entry.description,
    author: entry.author,
    version: entry.version,
    tags: entry.tags,
    category: entry.category,
    rating: 0,
    ratingCount: 0,
    downloadCount: 0,
    installCount: 0,
    favoriteCount: 0,
    likeCount: 0,
    dislikeCount: 0,
    commentCount: 0,
    resourceType: entry.resourceType,
    coverUrl: null,
    license: entry.license,
    visibility: 'public',
    status: 'published',
    resourceSize: entry.resourceSize,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    federationSource: entry.source === 'hub-peer' ? 'hub-peer' : 'p2p',
  })
}

function matchesQuery(entry: FederatedResourceCatalogEntry, input: CommunityResourceListInput): boolean {
  if (input.resourceType && entry.resourceType !== input.resourceType) return false
  if (input.category && entry.category !== input.category) return false
  if (input.tags?.length) {
    const tagSet = new Set(entry.tags)
    if (!input.tags.every((tag) => tagSet.has(tag))) return false
  }
  if (input.q?.trim()) {
    const q = input.q.trim().toLowerCase()
    const haystack = `${entry.title} ${entry.description}`.toLowerCase()
    if (!haystack.includes(q)) return false
  }
  return true
}

function sortItems(items: CommunityResourceItem[], sort?: CommunityResourceListInput['sort']): CommunityResourceItem[] {
  const field = sort ?? 'newest'
  return [...items].sort((left, right) => {
    switch (field) {
      case 'installs':
        return right.installCount - left.installCount
      case 'downloads':
        return right.downloadCount - left.downloadCount
      case 'rating':
        return right.rating - left.rating
      case 'newest':
      default:
        return right.updatedAt - left.updatedAt
    }
  })
}

export function listFederatedCatalogResources(
  input: CommunityResourceListInput = {},
): CommunityResourceItem[] {
  const map = loadStore()
  let items = [...map.values()]
    .filter((entry) => isMarketplaceFederatedEntry(entry))
    .filter((entry) => matchesQuery(entry, input))
    .map(toCommunityResourceItem)

  items = sortItems(items, input.sort)

  const offset = input.offset ?? 0
  const limit = input.limit ?? 100
  return items.slice(offset, offset + limit)
}

export function mergeHubAndFederatedResourceLists(
  hubItems: CommunityResourceItem[],
  federatedItems: CommunityResourceItem[],
): CommunityResourceItem[] {
  const merged = new Map<string, CommunityResourceItem>()

  for (const item of federatedItems) {
    const existing = merged.get(item.id)
    if (!existing) {
      merged.set(item.id, item)
      continue
    }
    const rank = (source?: CommunityResourceItem['federationSource']) =>
      source === 'hub-peer' ? 2 : source === 'p2p' ? 1 : 0
    if (rank(item.federationSource) >= rank(existing.federationSource)) {
      merged.set(item.id, item)
    }
  }

  for (const item of hubItems) {
    merged.set(item.id, { ...item, federationSource: 'hub' as const })
  }

  return [...merged.values()]
}

export function hasFederatedCatalogEntry(id: string): boolean {
  return loadStore().has(id)
}

export function removeFederatedCatalogEntry(id: string): boolean {
  const map = loadStore()
  if (!map.has(id)) return false
  map.delete(id)
  persistStore(map)
  broadcastFederatedCatalogUpdate({ action: 'delete', resourceId: id })
  return true
}

export function getFederatedCatalogStats() {
  const map = loadStore()
  return { entryCount: map.size }
}

export function resetFederatedCatalogCacheForTests(): void {
  cache = null
}
