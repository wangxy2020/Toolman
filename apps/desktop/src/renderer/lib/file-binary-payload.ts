/** Helpers for FileReadBinary IPC payloads (bytes preferred, base64 legacy). */

export function fileBinaryToUint8Array(payload: {
  bytes?: Uint8Array
  base64?: string
}): Uint8Array {
  if (payload.bytes && payload.bytes.byteLength > 0) {
    const copy = new Uint8Array(payload.bytes.byteLength)
    copy.set(payload.bytes)
    return copy
  }
  if (!payload.base64) {
    throw new Error('File payload missing bytes')
  }
  const binary = atob(payload.base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

export function fileBinaryToBase64(payload: {
  bytes?: Uint8Array
  base64?: string
}): string {
  if (payload.base64) return payload.base64
  const bytes = fileBinaryToUint8Array(payload)
  let binary = ''
  const chunk = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    const slice = bytes.subarray(offset, offset + chunk)
    binary += String.fromCharCode(...slice)
  }
  return btoa(binary)
}
