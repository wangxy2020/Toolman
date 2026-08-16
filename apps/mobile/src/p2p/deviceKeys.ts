const KEY = 'toolman.mobile.deviceEd25519.v1'

export type MobileDeviceKeyPair = {
  publicKeyB64: string
  privateJwk: JsonWebKey
}

let cached: MobileDeviceKeyPair | null = null

function webStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

async function getItem(key: string): Promise<string | null> {
  const web = webStorage()
  if (web) return web.getItem(key)
  try {
    const SecureStore = await import('expo-secure-store')
    return await SecureStore.getItemAsync(key)
  } catch {
    return null
  }
}

async function setItem(key: string, value: string): Promise<void> {
  const web = webStorage()
  if (web) {
    web.setItem(key, value)
    return
  }
  try {
    const SecureStore = await import('expo-secure-store')
    await SecureStore.setItemAsync(key, value)
  } catch {
    // ignore
  }
}

function bytesToB64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64')
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return globalThis.btoa(binary)
}

export function canUseEd25519(): boolean {
  return typeof crypto !== 'undefined' && typeof crypto.subtle?.generateKey === 'function'
}

export async function loadOrCreateDeviceKeys(): Promise<MobileDeviceKeyPair | null> {
  if (cached) return cached
  if (!canUseEd25519()) return null
  const raw = await getItem(KEY)
  if (raw) {
    try {
      cached = JSON.parse(raw) as MobileDeviceKeyPair
      return cached
    } catch {
      // recreate
    }
  }
  try {
    const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, [
      'sign',
      'verify',
    ])) as CryptoKeyPair
    const rawPub = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
    const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
    cached = { publicKeyB64: bytesToB64(rawPub), privateJwk }
    await setItem(KEY, JSON.stringify(cached))
    return cached
  } catch {
    return null
  }
}

export async function signDevicePayload(message: string): Promise<string | null> {
  const keys = await loadOrCreateDeviceKeys()
  if (!keys) return null
  try {
    const privateKey = await crypto.subtle.importKey(
      'jwk',
      keys.privateJwk,
      { name: 'Ed25519' },
      false,
      ['sign'],
    )
    const signature = new Uint8Array(
      await crypto.subtle.sign('Ed25519', privateKey, new TextEncoder().encode(message)),
    )
    return bytesToB64(signature)
  } catch {
    return null
  }
}
