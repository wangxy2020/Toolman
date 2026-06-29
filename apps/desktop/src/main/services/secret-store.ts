import { safeStorage } from 'electron'

export function isSecretStorageAvailable(): boolean {
  return safeStorage.isEncryptionAvailable()
}

export function encryptSecret(plain: string): string {
  if (!plain) {
    throw new Error('API Key 不能为空')
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(
      '系统安全存储不可用。macOS 请确认 Keychain 可访问；Linux 需安装 libsecret 并启用密钥环。',
    )
  }
  return safeStorage.encryptString(plain).toString('base64')
}

export function decryptSecret(encoded: string | null | undefined): string | null {
  if (!encoded) return null
  if (!safeStorage.isEncryptionAvailable()) return null
  try {
    return safeStorage.decryptString(Buffer.from(encoded, 'base64'))
  } catch {
    return null
  }
}
