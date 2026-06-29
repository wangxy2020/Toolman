import type {
  NativeAppendEventInput,
  NativeConnectionConnectResult,
  NativeInviteConnectResult,
  NativeWalEventRecord,
} from './p2p-bridge-types'
import { loadNativeModule } from './p2p-bridge-loader'

export async function bridgeInviteCreateOffer(inviteId: string, workspaceId?: string): Promise<string> {
  return loadNativeModule().inviteCreateOffer(inviteId, workspaceId ?? null)
}

export async function bridgeInviteWaitForAnswer(
  inviteId: string,
  timeoutSecs = 300,
): Promise<NativeConnectionConnectResult> {
  return loadNativeModule().inviteWaitForAnswer(inviteId, timeoutSecs)
}

export async function bridgeInviteConnectAsJoiner(
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

export function bridgeCryptoSetWorkspaceKey(
  workspaceId: string,
  workspaceKeyBase64: string,
  keyVersion = 1,
): void {
  loadNativeModule().cryptoSetWorkspaceKey(workspaceId, workspaceKeyBase64, keyVersion)
}

export async function bridgeCryptoRotateWorkspaceKey(
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

export function bridgeCryptoGenerateWorkspaceKey(): string {
  return loadNativeModule().cryptoGenerateWorkspaceKey()
}

export function bridgeDeviceIdentitySign(message: string): string {
  return loadNativeModule().deviceIdentitySign(message)
}

export function bridgeDeviceIdentityVerify(
  message: string,
  signatureB64: string,
  publicKeyB64: string,
): boolean {
  return loadNativeModule().deviceIdentityVerify(message, signatureB64, publicKeyB64)
}

export function bridgeEventStoreInit(dataDir: string): void {
  loadNativeModule().eventStoreInit(dataDir)
}

export function bridgeEventStoreAppend(
  workspaceId: string,
  input: NativeAppendEventInput,
): NativeWalEventRecord {
  return loadNativeModule().eventStoreAppend(workspaceId, input)
}

export function bridgeEventStoreList(
  workspaceId: string,
  sinceSeq: number,
  limit: number,
): NativeWalEventRecord[] {
  return loadNativeModule().eventStoreList(workspaceId, sinceSeq, limit)
}

export function bridgeSnapshotCompress(json: string): Buffer {
  return loadNativeModule().snapshotCompress(json)
}

export function bridgeSnapshotDecompress(data: Buffer): string {
  return loadNativeModule().snapshotDecompress(data)
}

export function bridgeSnapshotHash(json: string): string {
  return loadNativeModule().snapshotHash(json)
}

export function bridgeSnapshotInterval(): number {
  return loadNativeModule().snapshotInterval()
}
