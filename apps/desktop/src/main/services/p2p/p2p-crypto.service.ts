import { P2pBridge } from './p2p-bridge'

export function generateWorkspaceKey(): string {
  return P2pBridge.cryptoGenerateWorkspaceKey()
}

export function setWorkspaceKey(
  workspaceId: string,
  workspaceKeyBase64: string,
  keyVersion = 1,
): void {
  P2pBridge.cryptoSetWorkspaceKey(workspaceId, workspaceKeyBase64, keyVersion)
}

export async function rotateWorkspaceKey(
  workspaceId: string,
  workspaceKeyBase64: string,
  keyVersion: number,
): Promise<void> {
  await P2pBridge.cryptoRotateWorkspaceKey(workspaceId, workspaceKeyBase64, keyVersion)
}

export function signDeviceMessage(message: string): string {
  return P2pBridge.deviceIdentitySign(message)
}

export function verifyDeviceMessage(
  message: string,
  signatureB64: string,
  publicKeyB64: string,
): boolean {
  return P2pBridge.deviceIdentityVerify(message, signatureB64, publicKeyB64)
}
