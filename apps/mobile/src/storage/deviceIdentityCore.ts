export type MobileDeviceKind = 'mobile'

export type MobileDeviceIdentity = {
  deviceId: string
  identityId: string | null
  kind: MobileDeviceKind
  createdAt: number
  boundAt: number | null
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  )
}

function randomDeviceUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256)
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function createMobileDeviceId(): string {
  const uuid = randomDeviceUuid()
  return typeof document !== 'undefined' ? `web-${uuid}` : `mobile-${uuid}`
}

export function normalizeDeviceIdentity(
  raw: Partial<MobileDeviceIdentity> | null | undefined,
  fallbackDeviceId?: string,
): MobileDeviceIdentity {
  const now = Date.now()
  const deviceId =
    (typeof raw?.deviceId === 'string' && raw.deviceId.trim()) ||
    (fallbackDeviceId?.trim() || '') ||
    createMobileDeviceId()
  const identityId =
    typeof raw?.identityId === 'string' && raw.identityId.trim() ? raw.identityId.trim() : null
  return {
    deviceId,
    identityId,
    kind: 'mobile',
    createdAt: typeof raw?.createdAt === 'number' ? raw.createdAt : now,
    boundAt: identityId ? (typeof raw?.boundAt === 'number' ? raw.boundAt : now) : null,
  }
}

export function bindIdentityToDevice(
  device: MobileDeviceIdentity,
  identityId: string | null,
): MobileDeviceIdentity {
  const nextId = identityId?.trim() || null
  if (device.identityId === nextId) return device
  return {
    ...device,
    identityId: nextId,
    boundAt: nextId ? Date.now() : null,
  }
}

export function shouldKeepLegacyDeviceId(deviceId: string): boolean {
  return (
    deviceId.startsWith('mobile-') ||
    deviceId.startsWith('web-') ||
    isUuidLike(deviceId)
  )
}
