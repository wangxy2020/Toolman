import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export interface NativeDiscoveryConfig {
  deviceId: string
  deviceName: string
  userName: string
  publicKeyFingerprint: string
  appVersion: string
}

export interface NativeDeviceInfo {
  deviceId: string
  publicKey: string
  publicKeyFingerprint: string
  privateKeyRef: string
  createdAt: number
}

export interface NativeDiscoveredNode {
  deviceId: string
  deviceName: string
  userName: string
  publicKeyFingerprint: string
  online: boolean
  lastSeenAt: number
}

export interface NativeConnectionInfo {
  peerDeviceId: string
  state: string
  workspaceId?: string
  connectedAt?: number
  bytesSent: number
  bytesReceived: number
  connectionMode?: string
}

export interface NativeConnectionConnectResult {
  state: string
}

export interface NativeAppendEventInput {
  resourceType: string
  resourceId: string
  operatorId: string
  eventType: string
  payloadJson: string
  sourceDeviceId: string
  timestamp?: number
}

export interface NativeWalEventRecord {
  eventId: string
  workspaceId: string
  seq: number
  resourceType: string
  resourceId: string
  operatorId: string
  eventType: string
  payloadJson: string
  payloadHash: string
  prevEventHash: string | null
  eventHash: string
  timestamp: number
  sourceDeviceId: string
}

export interface NativeIncomingMessage {
  peerDeviceId: string
  channel: string
  data: Buffer
}

export interface NativeInviteConnectResult {
  state: string
  answerSdp: string
}

export interface P2pNativeModule {
  ping(): string
  version(): string
  discoveryStart(config: NativeDiscoveryConfig): void
  discoveryStop(): void
  discoveryIsRunning(): boolean
  discoveryListNodes(onlineOnly?: boolean): NativeDiscoveredNode[]
  deviceIdentityEnsure(dataDir: string): NativeDeviceInfo
  deviceIdentityGetInfo(): NativeDeviceInfo
  connectionConnect(
    peerDeviceId: string,
    workspaceId?: string | null,
  ): Promise<NativeConnectionConnectResult>
  connectionDisconnect(peerDeviceId: string): Promise<void>
  connectionList(): Promise<{ connections: NativeConnectionInfo[] }>
  connectionSend(peerDeviceId: string, channel: string, data: Buffer): Promise<void>
  connectionSetStunServers(servers: string[]): void
  connectionSetIceServers(
    servers: Array<{
      urls: string[]
      username?: string | null
      credential?: string | null
    }>,
  ): void
  connectionGetStunServers(): string[]
  inviteCreateOffer(inviteId: string, workspaceId?: string | null): Promise<string>
  inviteWaitForAnswer(
    inviteId: string,
    timeoutSecs?: number | null,
  ): Promise<NativeConnectionConnectResult>
  inviteConnectAsJoiner(
    ownerDeviceId: string,
    workspaceId: string | null | undefined,
    offerSdp: string,
    inviteId: string,
  ): Promise<NativeInviteConnectResult>
  cryptoSetWorkspaceKey(
    workspaceId: string,
    workspaceKeyBase64: string,
    keyVersion?: number | null,
  ): void
  cryptoRotateWorkspaceKey(
    workspaceId: string,
    workspaceKeyBase64: string,
    keyVersion: number,
  ): Promise<void>
  cryptoGenerateWorkspaceKey(): string
  deviceIdentitySign(message: string): string
  deviceIdentityVerify(
    message: string,
    signatureB64: string,
    publicKeyB64: string,
  ): boolean
  eventStoreInit(dataDir: string): void
  eventStoreAppend(workspaceId: string, input: NativeAppendEventInput): NativeWalEventRecord
  eventStoreList(workspaceId: string, sinceSeq: number, limit: number): NativeWalEventRecord[]
  connectionDrainAllMessages(): Promise<NativeIncomingMessage[]>
  connectionDrainMessages(peerDeviceId: string): Promise<Buffer[]>
  snapshotCompress(json: string): Buffer
  snapshotDecompress(data: Buffer): string
  snapshotHash(json: string): string
  snapshotInterval(): number
}

const NAPI_TRIPLE_BY_PLATFORM: Record<string, string> = {
  'darwin-arm64': 'darwin-arm64',
  'darwin-x64': 'darwin-x64',
  'win32-x64': 'win32-x64-msvc',
  'win32-arm64': 'win32-arm64-msvc',
  'linux-x64': 'linux-x64-gnu',
  'linux-arm64': 'linux-arm64-gnu',
}

function resolveNativeModulePath(): string {
  const key = `${process.platform}-${process.arch}`
  const triple = NAPI_TRIPLE_BY_PLATFORM[key]
  if (!triple) {
    throw new Error(`Unsupported platform for toolman-p2p: ${key}`)
  }

  const fileName = `toolman-p2p.${triple}.node`
  const candidates = [
    // electron-vite dev: out/main/services/p2p → apps/desktop/native
    join(__dirname, '..', '..', '..', '..', 'native', fileName),
    // packaged / copied next to out/main
    join(__dirname, '..', '..', '..', 'native', fileName),
    join(__dirname, '..', '..', 'native', fileName),
    join(process.cwd(), 'native', fileName),
    join(process.cwd(), 'apps', 'desktop', 'native', fileName),
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  throw new Error(
    `toolman-p2p native module not found for ${triple}. Run: pnpm build:p2p`,
  )
}

let cachedNative: P2pNativeModule | null = null

function loadNativeModule(): P2pNativeModule {
  if (cachedNative) return cachedNative
  const require = createRequire(__filename)
  const modulePath = resolveNativeModulePath()
  cachedNative = require(modulePath) as P2pNativeModule
  return cachedNative
}

export class P2pBridge {
  static ping(): string {
    return loadNativeModule().ping()
  }

  static version(): string {
    return loadNativeModule().version()
  }

  static discoveryStart(config: NativeDiscoveryConfig): void {
    loadNativeModule().discoveryStart(config)
  }

  static discoveryStop(): void {
    loadNativeModule().discoveryStop()
  }

  static discoveryIsRunning(): boolean {
    return loadNativeModule().discoveryIsRunning()
  }

  static discoveryListNodes(onlineOnly = false): NativeDiscoveredNode[] {
    return loadNativeModule().discoveryListNodes(onlineOnly)
  }

  static deviceIdentityEnsure(dataDir: string): NativeDeviceInfo {
    return loadNativeModule().deviceIdentityEnsure(dataDir)
  }

  static deviceIdentityGetInfo(): NativeDeviceInfo {
    return loadNativeModule().deviceIdentityGetInfo()
  }

  static connectionConnect(
    peerDeviceId: string,
    workspaceId?: string,
  ): Promise<NativeConnectionConnectResult> {
    return loadNativeModule().connectionConnect(peerDeviceId, workspaceId ?? null)
  }

  static connectionDisconnect(peerDeviceId: string): Promise<void> {
    return loadNativeModule().connectionDisconnect(peerDeviceId)
  }

  static async connectionList(): Promise<NativeConnectionInfo[]> {
    const result = await loadNativeModule().connectionList()
    return result.connections
  }

  static connectionSend(peerDeviceId: string, channel: string, data: Buffer): Promise<void> {
    return loadNativeModule().connectionSend(peerDeviceId, channel, data)
  }

  static connectionSetStunServers(servers: string[]): void {
    loadNativeModule().connectionSetStunServers(servers)
  }

  static connectionSetIceServers(
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

  static connectionGetStunServers(): string[] {
    return loadNativeModule().connectionGetStunServers()
  }

  static inviteCreateOffer(inviteId: string, workspaceId?: string): Promise<string> {
    return loadNativeModule().inviteCreateOffer(inviteId, workspaceId ?? null)
  }

  static inviteWaitForAnswer(inviteId: string, timeoutSecs = 300): Promise<NativeConnectionConnectResult> {
    return loadNativeModule().inviteWaitForAnswer(inviteId, timeoutSecs)
  }

  static inviteConnectAsJoiner(
    ownerDeviceId: string,
    workspaceId: string | undefined,
    offerSdp: string,
    inviteId: string,
  ): Promise<NativeInviteConnectResult> {
    return loadNativeModule().inviteConnectAsJoiner(
      ownerDeviceId,
      workspaceId ?? null,
      offerSdp,
      inviteId,
    )
  }

  static cryptoSetWorkspaceKey(
    workspaceId: string,
    workspaceKeyBase64: string,
    keyVersion = 1,
  ): void {
    loadNativeModule().cryptoSetWorkspaceKey(workspaceId, workspaceKeyBase64, keyVersion)
  }

  static cryptoRotateWorkspaceKey(
    workspaceId: string,
    workspaceKeyBase64: string,
    keyVersion: number,
  ): Promise<void> {
    return loadNativeModule().cryptoRotateWorkspaceKey(
      workspaceId,
      workspaceKeyBase64,
      keyVersion,
    )
  }

  static cryptoGenerateWorkspaceKey(): string {
    return loadNativeModule().cryptoGenerateWorkspaceKey()
  }

  static deviceIdentitySign(message: string): string {
    return loadNativeModule().deviceIdentitySign(message)
  }

  static deviceIdentityVerify(
    message: string,
    signatureB64: string,
    publicKeyB64: string,
  ): boolean {
    return loadNativeModule().deviceIdentityVerify(message, signatureB64, publicKeyB64)
  }

  static eventStoreInit(dataDir: string): void {
    loadNativeModule().eventStoreInit(dataDir)
  }

  static eventStoreAppend(
    workspaceId: string,
    input: NativeAppendEventInput,
  ): NativeWalEventRecord {
    return loadNativeModule().eventStoreAppend(workspaceId, input)
  }

  static eventStoreList(
    workspaceId: string,
    sinceSeq: number,
    limit: number,
  ): NativeWalEventRecord[] {
    return loadNativeModule().eventStoreList(workspaceId, sinceSeq, limit)
  }

  static async connectionDrainAllMessages(): Promise<NativeIncomingMessage[]> {
    return loadNativeModule().connectionDrainAllMessages()
  }

  static async connectionDrainMessages(peerDeviceId: string): Promise<Buffer[]> {
    return loadNativeModule().connectionDrainMessages(peerDeviceId)
  }

  static snapshotCompress(json: string): Buffer {
    return loadNativeModule().snapshotCompress(json)
  }

  static snapshotDecompress(data: Buffer): string {
    return loadNativeModule().snapshotDecompress(data)
  }

  static snapshotHash(json: string): string {
    return loadNativeModule().snapshotHash(json)
  }

  static snapshotInterval(): number {
    return loadNativeModule().snapshotInterval()
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
