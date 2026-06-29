import { logStructured } from './services/structured-log.service'
import { toErrorMessage } from '@toolman/shared'
import { bootstrapDatabase } from './bootstrap/database'
import { bootstrapSkills } from './services/skills-facade.service'
import { bootstrapMcpPresets } from './services/mcp-server-config.service'
import { bootstrapChannels } from './services/im-channel.facade.service'
import { startHeartbeatScheduler } from './services/heartbeat.service'
import { bootstrapKnowledgeWatchers } from './services/knowledge-watcher.service'
import { resumePendingIngestJobs } from './services/knowledge-ingest-resume.service'
import { startKnowledgeUrlRefreshScheduler } from './services/knowledge-url-refresh.service'
import { ensureP2pDeviceIdentity } from './services/p2p/p2p-device-identity.service'
import { ensureLocalDisplayNameSyncedToP2pMembers } from './services/identity.service'
import { startP2pDiscovery } from './services/p2p/p2p-discovery.service'
import { startP2pNetworkManager } from './services/p2p/p2p-network-manager.service'
import { startCommunityYjsBridge } from './services/community/community-yjs-bridge.service'
import { startCommunityCidProvider } from './services/community/community-cid-provider.service'
import { startCommunityFederationProvider } from './services/community/community-federation-provider.service'
import { startCommunityHubPeeringSync } from './services/community/community-hub-peering.service'
import { bootstrapP2pIceServers, applyP2pNetworkConfig, seedP2pNetworkConfigFromEnvIfNeeded } from './services/p2p/p2p-network.config'
import { startP2pConnectionMonitor } from './services/p2p/p2p-connection.service'
import { startP2pNetworkChangeMonitor } from './services/p2p/p2p-network-change.service'
import { resumeInterruptedBlobTransfers } from './services/p2p/p2p-blob-transfer.service'
import { bootstrapP2pWorkspaceKeys } from './services/p2p/p2p-workspace.service'
import { bootstrapP2pEventStore } from './services/p2p/p2p-event.service'
import { bootstrapP2pSync } from './services/p2p/p2p-sync.service'
import { bootstrapP2pAgentRelay } from './services/p2p/p2p-agent-relay.service'
import { bootstrapCommunityHub } from './services/community/community-bridge.service'
import { bootstrapCopyrightProvenance } from './services/copyright-provenance.service'
import { bootstrapAppUpdateService } from './services/app-update.service'
import { bootstrapCrashReportService } from './services/crash-report.service'
import { logLibp2pNativeStatus, logP2pNativeStatus } from './index-native-status'

export function bootstrapMainProcessServices(): void {
  try {
    bootstrapDatabase()
    ensureP2pDeviceIdentity()
    bootstrapCopyrightProvenance()
    ensureLocalDisplayNameSyncedToP2pMembers()
    seedP2pNetworkConfigFromEnvIfNeeded()
    void bootstrapP2pIceServers()
      .catch((error) => {
        const message = toErrorMessage(error, String(error))
        logStructured('p2p', 'warn', `Xirsys ICE bootstrap failed: ${message}`)
      })
      .finally(() => {
        applyP2pNetworkConfig()
        try {
          startP2pDiscovery()
        } catch (error) {
          const message = toErrorMessage(error, String(error))
          logStructured('p2p', 'warn', `discovery bootstrap failed: ${message}`)
        }
      })
    try {
      startP2pNetworkManager()
    } catch (error) {
      const message = toErrorMessage(error, String(error))
      logStructured('libp2p', 'warn', `network bootstrap failed: ${message}`)
    }
    void startCommunityYjsBridge().catch((error) => {
      const message = toErrorMessage(error, String(error))
      logStructured('community.yjs', 'warn', `bootstrap failed: ${message}`)
    })
    void startCommunityFederationProvider().catch((error) => {
      const message = toErrorMessage(error, String(error))
      logStructured('community.federation', 'warn', `bootstrap failed: ${message}`)
    })
    startCommunityHubPeeringSync()
    void startCommunityCidProvider().catch((error) => {
      const message = toErrorMessage(error, String(error))
      logStructured('community.cid', 'warn', `bootstrap failed: ${message}`)
    })
    bootstrapP2pEventStore()
    bootstrapP2pWorkspaceKeys()
    bootstrapMcpPresets()
    bootstrapSkills()
    bootstrapChannels()
    bootstrapAppUpdateService()
    bootstrapCrashReportService()
    bootstrapP2pSync()
    void resumeInterruptedBlobTransfers().catch((error) => {
      const message = toErrorMessage(error, String(error))
      logStructured('p2p', 'warn', `blob resume failed: ${message}`)
    })
    bootstrapP2pAgentRelay()
    startP2pConnectionMonitor()
    startP2pNetworkChangeMonitor()
    logP2pNativeStatus()
    logLibp2pNativeStatus()
    startHeartbeatScheduler()
    bootstrapKnowledgeWatchers()
    resumePendingIngestJobs()
    startKnowledgeUrlRefreshScheduler()
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error)
    logStructured('bootstrap', 'error', `failed: ${message}`)
  }
}

export function bootstrapCommunityHubAsync(): void {
  void bootstrapCommunityHub().then((status) => {
    if (status.running) {
      logStructured('community.hub', 'info', `ready at ${status.baseUrl}`)
    } else if (status.error) {
      logStructured('community.hub', 'warn', `unavailable: ${status.error}`)
    }
    void import('./services/crash-report.service')
      .then(({ flushPendingCrashReports }) => flushPendingCrashReports())
      .catch(() => undefined)
  })
}
