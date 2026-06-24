import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  FederationCatalogPageSchema,
  FederationLibp2pBootstrapSchema,
  FederatedResourceCatalogEntrySchema,
  normalizeCommunityHubBaseUrl,
  type FederatedResourceCatalogEntry,
  type FederationPeerSyncState,
  type FederationSyncStateStore,
} from '@toolman/shared'

import { recordDiagnosticEvent } from '../diagnostics-log'
import { fromApiJson } from './community-case'
import { upsertFederatedCatalogEntry } from './community-federated-catalog.service'
import { CommunityHttpClient, humanizeCommunityFetchError } from './community-http.client'
import { readCommunityHubConfig } from './community-hub.config'
import { getCommunityDataDir } from './community-paths'
import {
  isCommunityFederationEnabled,
  readCommunityFederationConfig,
} from './community-federation.config'

const SYNC_STATE_FILE = 'federation-sync-state.json'

let syncTimer: ReturnType<typeof setInterval> | null = null
let syncInFlight = false

function getSyncStatePath(): string {
  const dir = getCommunityDataDir()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return join(dir, SYNC_STATE_FILE)
}

function loadSyncState(): FederationSyncStateStore {
  const path = getSyncStatePath()
  if (!existsSync(path)) {
    return { peers: [] }
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as FederationSyncStateStore
    return { peers: parsed.peers ?? [] }
  } catch {
    return { peers: [] }
  }
}

function persistSyncState(store: FederationSyncStateStore): void {
  writeFileSync(getSyncStatePath(), JSON.stringify(store, null, 2), 'utf8')
}

function getPeerState(store: FederationSyncStateStore, peerUrl: string): FederationPeerSyncState {
  const normalized = normalizeCommunityHubBaseUrl(peerUrl)
  return (
    store.peers.find((item: FederationPeerSyncState) => item.peerUrl === normalized) ?? {
      peerUrl: normalized,
      updatedAfter: 0,
    }
  )
}

function resolvePeerUrls(): string[] {
  const config = readCommunityHubConfig()
  const peers = (config.peers ?? []).map(normalizeCommunityHubBaseUrl)
  const upstream = config.upstream ? normalizeCommunityHubBaseUrl(config.upstream) : null
  const ordered = upstream ? [upstream, ...peers.filter((item) => item !== upstream)] : peers
  return [...new Set(ordered)]
}

function mapCatalogEntry(raw: Record<string, unknown>): FederatedResourceCatalogEntry | null {
  try {
    const entry = fromApiJson(raw) as Record<string, unknown>
    const author = (entry.author ?? {}) as Record<string, unknown>
    return FederatedResourceCatalogEntrySchema.parse({
      id: entry.id,
      title: entry.title,
      description: entry.description ?? '',
      author: {
        id: author.id,
        displayName: author.displayName ?? author.display_name ?? '远程用户',
      },
      version: entry.version,
      tags: entry.tags ?? [],
      category: entry.category ?? '',
      resourceType: entry.resourceType ?? entry.resource_type,
      resourceSize: entry.resourceSize ?? entry.resource_size ?? 0,
      rootCid: entry.rootCid ?? entry.root_cid ?? '',
      license: entry.license ?? '',
      createdAt: entry.createdAt ?? entry.created_at,
      updatedAt: entry.updatedAt ?? entry.updated_at,
    })
  } catch {
    return null
  }
}

async function syncPeerCatalog(
  peerUrl: string,
  updatedAfter: number,
  _timeoutMs: number,
): Promise<{ imported: number; latestUpdatedAt: number; error?: string }> {
  const normalized = normalizeCommunityHubBaseUrl(peerUrl)
  const client = new CommunityHttpClient({ baseUrl: normalized })

  try {
    const response = await client.get<Record<string, unknown>>(
      `/api/v1/federation/catalog?updated_after=${updatedAfter}&limit=200`,
      { authenticated: false },
    )

    const page = FederationCatalogPageSchema.parse({
      items: Array.isArray(response.items)
        ? response.items
            .map((item) => mapCatalogEntry(item as Record<string, unknown>))
            .filter((item): item is FederatedResourceCatalogEntry => Boolean(item?.rootCid))
        : [],
      latestUpdatedAt: response.latest_updated_at ?? response.latestUpdatedAt,
    })

    let imported = 0
    let latestUpdatedAt = updatedAfter
    for (const entry of page.items) {
      if (upsertFederatedCatalogEntry(entry, { source: 'hub-peer', peerHubUrl: normalized })) {
        imported += 1
      }
      latestUpdatedAt = Math.max(latestUpdatedAt, entry.updatedAt)
    }

    if (page.latestUpdatedAt != null) {
      latestUpdatedAt = Math.max(latestUpdatedAt, page.latestUpdatedAt)
    }

    return { imported, latestUpdatedAt }
  } catch (error) {
    return {
      imported: 0,
      latestUpdatedAt: updatedAfter,
      error: humanizeCommunityFetchError(error),
    }
  }
}

export async function runCommunityHubPeeringSync(): Promise<void> {
  if (!isCommunityFederationEnabled()) return
  if (syncInFlight) return

  const peerUrls = resolvePeerUrls()
  if (peerUrls.length === 0) return

  syncInFlight = true
  const federationConfig = readCommunityFederationConfig()
  const store = loadSyncState()

  try {
    for (const peerUrl of peerUrls) {
      const peerState = getPeerState(store, peerUrl)
      const result = await syncPeerCatalog(
        peerUrl,
        peerState.updatedAfter,
        federationConfig.peerTimeoutMs,
      )

      const nextPeerState: FederationPeerSyncState = {
        peerUrl: normalizeCommunityHubBaseUrl(peerUrl),
        updatedAfter: result.latestUpdatedAt,
        lastSyncedAt: Date.now(),
        lastError: result.error,
      }

      store.peers = [
        ...store.peers.filter((item: FederationPeerSyncState) => item.peerUrl !== nextPeerState.peerUrl),
        nextPeerState,
      ]

      if (result.error) {
        recordDiagnosticEvent(
          'community-federation',
          'warn',
          `hub-peer sync failed for ${peerUrl}: ${result.error}`,
        )
      } else if (result.imported > 0) {
        recordDiagnosticEvent(
          'community-federation',
          'info',
          `hub-peer sync imported ${result.imported} entries from ${peerUrl}`,
        )
      }
    }

    store.lastUpstreamSyncAt = Date.now()
    persistSyncState(store)
  } finally {
    syncInFlight = false
  }
}

export function getCommunityHubPeeringSyncState(): FederationSyncStateStore {
  return loadSyncState()
}

export function startCommunityHubPeeringSync(): void {
  stopCommunityHubPeeringSync()
  if (!isCommunityFederationEnabled()) return

  const peerUrls = resolvePeerUrls()
  if (peerUrls.length === 0) return

  const intervalMs = readCommunityFederationConfig().syncIntervalMs
  void (async () => {
    await runCommunityHubPeeringSync()
    const { syncLibp2pBootstrapFromPeerHubs } = await import(
      './community-libp2p-bootstrap-sync.service'
    )
    await syncLibp2pBootstrapFromPeerHubs()
  })()
  syncTimer = setInterval(() => {
    void runCommunityHubPeeringSync()
  }, intervalMs)
}

export function stopCommunityHubPeeringSync(): void {
  if (syncTimer) {
    clearInterval(syncTimer)
    syncTimer = null
  }
}

export async function fetchPeerLibp2pBootstrap(peerUrl: string): Promise<string[]> {
  const client = new CommunityHttpClient({
    baseUrl: normalizeCommunityHubBaseUrl(peerUrl),
  })
  const data = await client.get<Record<string, unknown>>('/api/v1/federation/libp2p-bootstrap', {
    authenticated: false,
  })
  const parsed = FederationLibp2pBootstrapSchema.parse({
    bootstrapMultiaddrs: data.bootstrap_multiaddrs ?? data.bootstrapMultiaddrs ?? [],
  })
  return parsed.bootstrapMultiaddrs
}
