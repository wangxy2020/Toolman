import { createRequire } from 'node:module'

import { resolveNativeAddonPath } from '../../bootstrap/native-module-path'

export interface NativeLibp2pPeer {
  peerId: string
  transport: string
  connectedAt: number
}

export interface NativeDhtHealth {
  mode: string
  bootstrapCount: number
  ready: boolean
  error?: string | null
}

export interface NativeNetworkSnapshot {
  running: boolean
  localPeerId?: string | null
  peerCount: number
  peers: NativeLibp2pPeer[]
  dht: NativeDhtHealth
  error?: string | null
}

export interface Libp2pNativeModule {
  ping(): string
  version(): string
  networkStart(dataDir: string, configJson: string): void
  networkStop(): void
  networkIsRunning(): boolean
  networkLocalPeerId(): string | null
  networkPeerCount(): number
  networkListPeers(): { peers: NativeLibp2pPeer[] }
  networkGetSnapshot(): NativeNetworkSnapshot
  networkDhtHealth(): NativeDhtHealth
  pubsubSubscribe(topic: string): void
  pubsubUnsubscribe(topic: string): void
  pubsubPublish(topic: string, data: Buffer): void
  pubsubDrainMessages(): { messages: NativePubsubMessage[] }
  dhtProvide(cid: string): void
  dhtGetProviders(cid: string): void
  dhtDrainProviderResults(): { results: NativeDhtProviderResult[] }
}

export interface NativeDhtProviderResult {
  cid: string
  providers: string[]
  completed: boolean
  error?: string | null
  at: number
}

export interface NativePubsubMessage {
  topic: string
  data: Buffer
  fromPeerId: string
  receivedAt: number
}

function resolveNativeModulePath(): string {
  return resolveNativeAddonPath('toolman-libp2p', __dirname, 'pnpm build:libp2p')
}

let cachedNative: Libp2pNativeModule | null = null

function loadNativeModule(): Libp2pNativeModule {
  if (cachedNative) return cachedNative
  const require = createRequire(__filename)
  const modulePath = resolveNativeModulePath()
  cachedNative = require(modulePath) as Libp2pNativeModule
  return cachedNative
}

export class Libp2pBridge {
  static ping(): string {
    return loadNativeModule().ping()
  }

  static version(): string {
    return loadNativeModule().version()
  }

  static networkStart(dataDir: string, configJson: string): void {
    loadNativeModule().networkStart(dataDir, configJson)
  }

  static networkStop(): void {
    loadNativeModule().networkStop()
  }

  static networkIsRunning(): boolean {
    return loadNativeModule().networkIsRunning()
  }

  static networkLocalPeerId(): string | null {
    return loadNativeModule().networkLocalPeerId()
  }

  static networkPeerCount(): number {
    return loadNativeModule().networkPeerCount()
  }

  static networkListPeers(): NativeLibp2pPeer[] {
    return loadNativeModule().networkListPeers().peers
  }

  static networkGetSnapshot(): NativeNetworkSnapshot {
    return loadNativeModule().networkGetSnapshot()
  }

  static networkDhtHealth(): NativeDhtHealth {
    return loadNativeModule().networkDhtHealth()
  }

  static pubsubSubscribe(topic: string): void {
    loadNativeModule().pubsubSubscribe(topic)
  }

  static pubsubUnsubscribe(topic: string): void {
    loadNativeModule().pubsubUnsubscribe(topic)
  }

  static pubsubPublish(topic: string, data: Buffer): void {
    loadNativeModule().pubsubPublish(topic, data)
  }

  static pubsubDrainMessages(): NativePubsubMessage[] {
    return loadNativeModule().pubsubDrainMessages().messages
  }

  static dhtProvide(cid: string): void {
    loadNativeModule().dhtProvide(cid)
  }

  static dhtGetProviders(cid: string): void {
    loadNativeModule().dhtGetProviders(cid)
  }

  static dhtDrainProviderResults(): NativeDhtProviderResult[] {
    return loadNativeModule().dhtDrainProviderResults().results
  }

  static isAvailable(): boolean {
    try {
      resolveNativeModulePath()
      return true
    } catch {
      return false
    }
  }
}
