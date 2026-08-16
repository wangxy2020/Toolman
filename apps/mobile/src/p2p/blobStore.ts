export type StoredBlob = {
  contentHash: string
  mimeType: string
  name?: string
  bytes: Uint8Array
}

const memory = new Map<string, StoredBlob>()
const objectUrls = new Map<string, string>()

export function putBlob(blob: StoredBlob): void {
  memory.set(blob.contentHash, blob)
  const previous = objectUrls.get(blob.contentHash)
  if (previous) URL.revokeObjectURL(previous)
  const url = URL.createObjectURL(new Blob([blob.bytes], { type: blob.mimeType }))
  objectUrls.set(blob.contentHash, url)
}

export function getBlob(contentHash: string): StoredBlob | undefined {
  return memory.get(contentHash)
}

export function hasBlob(contentHash: string): boolean {
  return memory.has(contentHash)
}

export function blobObjectUrl(contentHash: string): string | undefined {
  return objectUrls.get(contentHash)
}
