import {
  CidDistributionStatusSchema,
  cidWireTopic,
} from '@toolman/shared'

import { recordDiagnosticEvent } from '../diagnostics-log'
import { Libp2pBridge } from '../p2p/libp2p-bridge'
import { isCommunityCidDistributionEnabled, ensureDefaultCommunityCidConfig, readCommunityCidConfig, writeCommunityCidConfig } from './community-cid.config'
import {
  getCommunityCidIndexStats,
  scanCommunityPackagesForCidIndex,
} from './community-cid-index.service'
import { getCommunityCidFetchStats, handleCidWireMessage } from './community-cid-fetch.service'
import { getCommunityCidSigningStats, signCidWireAnnounce, verifyCidWireAnnounce } from './community-cid-signing.service'

const CID_TOPICS = [
  cidWireTopic('announce'),
  cidWireTopic('request'),
  cidWireTopic('response'),
  cidWireTopic('chunk-request'),
  cidWireTopic('chunk-response'),
]

let started = false
let pollTimer: ReturnType<typeof setInterval> | null = null
let lastError: string | null = null
let providedRootCids = 0
let dhtProvides = 0
let dhtProviderLookups = 0

function publishAnnouncements(indexed: Awaited<ReturnType<typeof scanCommunityPackagesForCidIndex>>): void {
  if (!Libp2pBridge.isAvailable() || !Libp2pBridge.networkIsRunning()) return

  for (const entry of indexed) {
    try {
      const wire = signCidWireAnnounce(entry.manifest)
      if (!verifyCidWireAnnounce(wire)) continue

      Libp2pBridge.pubsubPublish(
        cidWireTopic('announce'),
        Buffer.from(JSON.stringify(wire), 'utf8'),
      )

      Libp2pBridge.dhtProvide(entry.manifest.rootCid)
      dhtProvides += 1
      providedRootCids += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      recordDiagnosticEvent('community-cid', 'warn', `provide failed: ${message}`)
    }
  }
}

function pollCidInbox(): void {
  if (!Libp2pBridge.isAvailable()) return

  try {
    const messages = Libp2pBridge.pubsubDrainMessages()
    for (const message of messages) {
      if (message.topic === cidWireTopic('announce')) {
        try {
          const parsed = JSON.parse(message.data.toString('utf8'))
          if (verifyCidWireAnnounce(parsed)) {
            Libp2pBridge.dhtGetProviders(parsed.manifest.rootCid)
            dhtProviderLookups += 1
          }
        } catch {
          // ignore malformed announce
        }
      }

      handleCidWireMessage(message.topic, Buffer.from(message.data))
    }

    for (const result of Libp2pBridge.dhtDrainProviderResults()) {
      if (result.error) {
        recordDiagnosticEvent('community-cid', 'warn', result.error)
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    lastError = message
    recordDiagnosticEvent('community-cid', 'warn', message)
  }
}

export async function startCommunityCidProvider(): Promise<void> {
  if (started || !isCommunityCidDistributionEnabled()) return
  if (!Libp2pBridge.isAvailable()) {
    lastError = 'libp2p native module unavailable'
    return
  }

  ensureDefaultCommunityCidConfig()
  started = true

  for (const topic of CID_TOPICS) {
    try {
      Libp2pBridge.pubsubSubscribe(topic)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      lastError = message
      recordDiagnosticEvent('community-cid', 'warn', `subscribe ${topic}: ${message}`)
    }
  }

  try {
    const indexed = await scanCommunityPackagesForCidIndex()
    publishAnnouncements(indexed)
    recordDiagnosticEvent('community-cid', 'info', `indexed packages=${indexed.length}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    lastError = message
    recordDiagnosticEvent('community-cid', 'warn', `scan failed: ${message}`)
  }

  pollTimer = setInterval(() => {
    pollCidInbox()
  }, 2_000)
}

export function stopCommunityCidProvider(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }

  if (Libp2pBridge.isAvailable()) {
    for (const topic of CID_TOPICS) {
      try {
        Libp2pBridge.pubsubUnsubscribe(topic)
      } catch {
        // ignore shutdown errors
      }
    }
  }

  started = false
}

export function getCommunityCidProviderStatus() {
  const indexStats = getCommunityCidIndexStats()
  const fetchStats = getCommunityCidFetchStats()
  const signingStats = getCommunityCidSigningStats()

  return CidDistributionStatusSchema.parse({
    enabled: isCommunityCidDistributionEnabled(),
    running: started,
    indexedPackages: indexStats.indexedPackages,
    indexedChunks: indexStats.indexedChunks,
    providedRootCids,
    dhtProvides,
    dhtProviderLookups,
    fetchedPackages: fetchStats.fetchedPackages,
    verifyFailures: signingStats.verifyFailures,
    lastError,
  })
}

export async function rescanCommunityCidIndex(): Promise<void> {
  const indexed = await scanCommunityPackagesForCidIndex()
  publishAnnouncements(indexed)
}

export async function setCommunityCidDistributionEnabled(enabled: boolean) {
  ensureDefaultCommunityCidConfig()
  const current = readCommunityCidConfig()
  if (current.cidDistributionEnabled !== enabled) {
    writeCommunityCidConfig({ ...current, cidDistributionEnabled: enabled })
    recordDiagnosticEvent('community-cid', 'info', enabled ? 'enabled via diagnostics' : 'disabled via diagnostics')
  }

  if (enabled) {
    await startCommunityCidProvider()
  } else {
    stopCommunityCidProvider()
  }

  return getCommunityCidProviderStatus()
}
