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
  connectionRestartIce(peerDeviceId: string): Promise<NativeConnectionConnectResult>
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

export type {
  NativeConnectionInfo as NativeConnectionInfoExport,
}
