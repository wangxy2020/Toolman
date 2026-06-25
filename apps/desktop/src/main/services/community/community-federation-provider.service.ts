import {
  FEDERATION_CATALOG_TOPIC,
  FederatedCatalogWireMessageSchema,
  cidWireTopic,
} from '@toolman/shared'
import { toErrorMessage } from '@toolman/shared'

import { recordDiagnosticEvent } from '../diagnostics-log'
import { Libp2pBridge } from '../p2p/libp2p-bridge'
import { verifyCidWireAnnounce } from './community-cid-signing.service'
import {
  ensureDefaultCommunityFederationConfig,
  isCommunityFederationEnabled,
} from './community-federation.config'
import {
  getCommunityFederationSigningStats,
  signFederatedCatalogWireMessage,
  verifyFederatedCatalogWireMessage,
} from './community-federation-signing.service'
import {
  getFederatedCatalogStats,
  upsertFederatedCatalogEntry,
  upsertFederatedCatalogFromCidManifest,
} from './community-federated-catalog.service'

let started = false
let lastError: string | null = null
let catalogMessagesReceived = 0

function subscribeFederationTopics(): void {
  if (!Libp2pBridge.isAvailable()) return
  try {
    Libp2pBridge.pubsubSubscribe(FEDERATION_CATALOG_TOPIC)
  } catch (error) {
    const message = toErrorMessage(error, String(error))
    lastError = message
    recordDiagnosticEvent('community-federation', 'warn', `subscribe failed: ${message}`)
  }
}

export function publishFederatedCatalogWireMessage(
  entry: Parameters<typeof signFederatedCatalogWireMessage>[0],
): void {
  if (!isCommunityFederationEnabled()) return
  if (!Libp2pBridge.isAvailable() || !Libp2pBridge.networkIsRunning()) return

  try {
    const wire = signFederatedCatalogWireMessage(entry)
    Libp2pBridge.pubsubPublish(
      FEDERATION_CATALOG_TOPIC,
      Buffer.from(JSON.stringify(wire), 'utf8'),
    )
    upsertFederatedCatalogEntry(entry)
    recordDiagnosticEvent('community-federation', 'info', `published catalog ${entry.id}`)
  } catch (error) {
    const message = toErrorMessage(error, String(error))
    lastError = message
    recordDiagnosticEvent('community-federation', 'warn', `publish failed: ${message}`)
  }
}

export function handleCommunityFederationPubsubMessage(topic: string, data: Buffer): void {
  handleFederationInboxMessage(topic, data)
}

function handleFederationInboxMessage(topic: string, data: Buffer): void {
  if (topic === FEDERATION_CATALOG_TOPIC) {
    try {
      const parsed = FederatedCatalogWireMessageSchema.parse(JSON.parse(data.toString('utf8')))
      if (!verifyFederatedCatalogWireMessage(parsed)) return
      if (upsertFederatedCatalogEntry(parsed.entry)) {
        catalogMessagesReceived += 1
      }
    } catch {
      // ignore malformed catalog wire messages
    }
    return
  }

  if (topic === cidWireTopic('announce')) {
    try {
      const parsed = JSON.parse(data.toString('utf8'))
      if (verifyCidWireAnnounce(parsed)) {
        upsertFederatedCatalogFromCidManifest(parsed.manifest, parsed.signerDid)
      }
    } catch {
      // ignore malformed CID announce fallback
    }
  }
}

export async function resubscribeCommunityFederationPubsub(): Promise<void> {
  if (!isCommunityFederationEnabled()) return
  if (!Libp2pBridge.isAvailable() || !Libp2pBridge.networkIsRunning()) return
  subscribeFederationTopics()
}

export async function startCommunityFederationProvider(): Promise<void> {
  if (started || !isCommunityFederationEnabled()) return
  if (!Libp2pBridge.isAvailable()) {
    lastError = 'libp2p native module unavailable'
    return
  }

  ensureDefaultCommunityFederationConfig()
  started = true
  subscribeFederationTopics()
  recordDiagnosticEvent('community-federation', 'info', 'federation provider started')
}

export function stopCommunityFederationProvider(): void {
  if (Libp2pBridge.isAvailable()) {
    try {
      Libp2pBridge.pubsubUnsubscribe(FEDERATION_CATALOG_TOPIC)
    } catch {
      // ignore shutdown errors
    }
  }

  started = false
}

export function getCommunityFederationProviderStatus() {
  const catalogStats = getFederatedCatalogStats()
  const signingStats = getCommunityFederationSigningStats()
  return {
    started,
    federationEnabled: isCommunityFederationEnabled(),
    catalogEntries: catalogStats.entryCount,
    catalogMessagesReceived,
    verifyFailures: signingStats.verifyFailures,
    lastError,
  }
}
