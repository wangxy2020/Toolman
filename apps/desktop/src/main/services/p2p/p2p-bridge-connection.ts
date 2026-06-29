import type {
  NativeConnectionConnectResult,
  NativeConnectionInfo,
  NativeDiscoveryConfig,
  NativeDeviceInfo,
  NativeDiscoveredNode,
} from './p2p-bridge-types'
import { loadNativeModule } from './p2p-bridge-loader'

export function bridgePing(): string {
  return loadNativeModule().ping()
}

export function bridgeVersion(): string {
  return loadNativeModule().version()
}

export function bridgeDiscoveryStart(config: NativeDiscoveryConfig): void {
  loadNativeModule().discoveryStart(config)
}

export function bridgeDiscoveryStop(): void {
  loadNativeModule().discoveryStop()
}

export function bridgeDiscoveryIsRunning(): boolean {
  return loadNativeModule().discoveryIsRunning()
}

export function bridgeDiscoveryListNodes(onlineOnly = false): NativeDiscoveredNode[] {
  return loadNativeModule().discoveryListNodes(onlineOnly)
}

export function bridgeDeviceIdentityEnsure(dataDir: string): NativeDeviceInfo {
  return loadNativeModule().deviceIdentityEnsure(dataDir)
}

export function bridgeDeviceIdentityGetInfo(): NativeDeviceInfo {
  return loadNativeModule().deviceIdentityGetInfo()
}

export async function bridgeConnectionConnect(
  peerDeviceId: string,
  workspaceId?: string,
): Promise<NativeConnectionConnectResult> {
  return loadNativeModule().connectionConnect(peerDeviceId, workspaceId ?? null)
}

export async function bridgeConnectionDisconnect(peerDeviceId: string): Promise<void> {
  return loadNativeModule().connectionDisconnect(peerDeviceId)
}

export async function bridgeConnectionRestartIce(
  peerDeviceId: string,
): Promise<NativeConnectionConnectResult> {
  return loadNativeModule().connectionRestartIce(peerDeviceId)
}

export async function bridgeConnectionList(): Promise<NativeConnectionInfo[]> {
  const result = await loadNativeModule().connectionList()
  return result.connections
}

export async function bridgeConnectionSend(
  peerDeviceId: string,
  channel: string,
  data: Buffer,
): Promise<void> {
  return loadNativeModule().connectionSend(peerDeviceId, channel, data)
}

export function bridgeConnectionSetStunServers(servers: string[]): void {
  loadNativeModule().connectionSetStunServers(servers)
}

export function bridgeConnectionSetIceServers(
  servers: Array<{
    urls: string | string[]
    username?: string
    credential?: string
  }>,
): void {
  const native = loadNativeModule()
  if (typeof native.connectionSetIceServers === 'function') {
    native.connectionSetIceServers(
      servers.map((server) => {
        const entry: {
          urls: string[]
          username?: string
          credential?: string
        } = {
          urls: Array.isArray(server.urls) ? server.urls : [server.urls],
        }
        if (server.username?.trim()) {
          entry.username = server.username.trim()
        }
        if (server.credential?.trim()) {
          entry.credential = server.credential.trim()
        }
        return entry
      }),
    )
    return
  }
  const flat = servers.flatMap((server) =>
    Array.isArray(server.urls) ? server.urls : [server.urls],
  )
  native.connectionSetStunServers(flat.length > 0 ? flat : ['stun:stun.l.google.com:19302'])
}

export function bridgeConnectionGetStunServers(): string[] {
  return loadNativeModule().connectionGetStunServers()
}

export async function bridgeConnectionDrainAllMessages(): Promise<
  import('./p2p-bridge-types').NativeIncomingMessage[]
> {
  return loadNativeModule().connectionDrainAllMessages()
}

export async function bridgeConnectionDrainMessages(peerDeviceId: string): Promise<Buffer[]> {
  return loadNativeModule().connectionDrainMessages(peerDeviceId)
}
