import { disconnectAllMcpServers } from './services/mcp-client-manager.service'
import { destroyAllBrowserSessions } from './services/browser-cdp.service'
import { stopAllKnowledgeWatchers } from './services/knowledge-watcher.service'
import { stopKnowledgeUrlRefreshScheduler } from './services/knowledge-url-refresh.service'
import { stopP2pDiscovery } from './services/p2p/p2p-discovery.service'
import { stopP2pNetworkManager } from './services/p2p/p2p-network-manager.service'
import { stopCommunityYjsProvider } from './services/community/community-yjs-provider'
import { stopCommunityFederationProvider } from './services/community/community-federation-provider.service'
import { stopCommunityHubPeeringSync } from './services/community/community-hub-peering.service'
import { stopCommunityCidProvider } from './services/community/community-cid-provider.service'
import { stopP2pConnectionMonitor } from './services/p2p/p2p-connection.service'
import { stopP2pNetworkChangeMonitor } from './services/p2p/p2p-network-change.service'
import { shutdownCommunityHub } from './services/community/community-bridge.service'
import { shutdownChannels } from './services/im-channel.facade.service'
import { stopHeartbeatScheduler } from './services/heartbeat.service'
import { stopCopyrightProvenance } from './services/copyright-provenance.service'

export async function runGracefulShutdown(): Promise<void> {
  stopHeartbeatScheduler()
  stopCopyrightProvenance()
  stopAllKnowledgeWatchers()
  stopKnowledgeUrlRefreshScheduler()
  stopP2pDiscovery()
  stopP2pNetworkManager()
  stopCommunityYjsProvider()
  stopCommunityFederationProvider()
  stopCommunityHubPeeringSync()
  stopCommunityCidProvider()
  stopP2pConnectionMonitor()
  stopP2pNetworkChangeMonitor()
  await shutdownCommunityHub().catch(() => undefined)
  await disconnectAllMcpServers().catch(() => undefined)
  await shutdownChannels().catch(() => undefined)
  destroyAllBrowserSessions()
}
