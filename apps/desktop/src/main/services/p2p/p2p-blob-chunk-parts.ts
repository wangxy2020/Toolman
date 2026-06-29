import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

function blobChunkPartPath(contentHash: string, index: number): string {
  const dir = join(app.getPath('userData'), 'p2p', 'blob-parts', contentHash)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return join(dir, `${index}.part`)
}

export function writeBlobChunkPart(contentHash: string, index: number, data: Buffer): void {
  writeFileSync(blobChunkPartPath(contentHash, index), data)
}

export function readBlobChunkPart(contentHash: string, index: number): Buffer | null {
  const path = blobChunkPartPath(contentHash, index)
  if (!existsSync(path)) return null
  return readFileSync(path)
}

export function clearBlobChunkParts(contentHash: string): void {
  const dir = join(app.getPath('userData'), 'p2p', 'blob-parts', contentHash)
  if (!existsSync(dir)) return
  for (let index = 0; index < 10_000; index += 1) {
    const path = join(dir, `${index}.part`)
    if (!existsSync(path)) {
      if (index > 0) break
      continue
    }
    try {
      unlinkSync(path)
    } catch {
      // ignore
    }
  }
}

export function listReceivedChunkIndices(contentHash: string, totalChunks: number): number[] {
  const indices: number[] = []
  for (let index = 0; index < totalChunks; index += 1) {
    if (readBlobChunkPart(contentHash, index)) {
      indices.push(index)
    }
  }
  return indices
}
