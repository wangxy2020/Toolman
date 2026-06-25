import { recordDiagnosticEvent } from '../diagnostics-log'
import { readLibp2pConfig, writeLibp2pConfig } from '../p2p/p2p-libp2p.config'
import {normalizeCommunityHubBaseUrl, toErrorMessage } from '@toolman/shared'
import { readCommunityHubConfig } from './community-hub.config'
import { fetchPeerLibp2pBootstrap } from './community-hub-peering.service'
import { isCommunityFederationEnabled } from './community-federation.config'

export async function syncLibp2pBootstrapFromPeerHubs(): Promise<number> {
  if (!isCommunityFederationEnabled()) return 0

  const config = readCommunityHubConfig()
  const peerUrls = [
    ...(config.upstream ? [config.upstream] : []),
    ...(config.peers ?? []),
  ]
    .map(normalizeCommunityHubBaseUrl)
    .filter(Boolean)

  const uniquePeerUrls = [...new Set(peerUrls)]
  if (uniquePeerUrls.length === 0) return 0

  const current = readLibp2pConfig()
  const merged = new Set(current.bootstrapMultiaddrs ?? [])
  let added = 0

  for (const peerUrl of uniquePeerUrls) {
    try {
      const bootstrapMultiaddrs = await fetchPeerLibp2pBootstrap(peerUrl)
      for (const addr of bootstrapMultiaddrs) {
        if (!merged.has(addr)) {
          merged.add(addr)
          added += 1
        }
      }
    } catch (error) {
      const message = toErrorMessage(error, String(error))
      recordDiagnosticEvent(
        'community-federation',
        'warn',
        `bootstrap sync failed for ${peerUrl}: ${message}`,
      )
    }
  }

  if (added > 0) {
    writeLibp2pConfig({
      ...current,
      bootstrapMultiaddrs: [...merged],
    })
    recordDiagnosticEvent(
      'community-federation',
      'info',
      `merged ${added} libp2p bootstrap addr(s) from peer hubs`,
    )
  }

  return added
}
