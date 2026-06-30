import { createHash } from 'node:crypto'
import { closeSync, createReadStream, openSync, readSync } from 'node:fs'
import { pipeline } from 'node:stream/promises'

export const FILE_IO_CHUNK_SIZE = 64 * 1024

function createHashUpdater() {
  const hash = createHash('sha256')
  return {
    update(chunk: Buffer) {
      hash.update(chunk)
    },
    digest(): string {
      return hash.digest('hex')
    },
  }
}

/** Sync streaming SHA-256 — avoids loading the entire file into RAM. */
export function hashFileBytes(filePath: string): string {
  const hasher = createHashUpdater()
  const fd = openSync(filePath, 'r')
  const buffer = Buffer.alloc(FILE_IO_CHUNK_SIZE)
  try {
    let bytesRead = 0
    while ((bytesRead = readSync(fd, buffer, 0, buffer.length, null)) > 0) {
      hasher.update(buffer.subarray(0, bytesRead))
    }
  } finally {
    closeSync(fd)
  }
  return hasher.digest()
}

/** Async streaming SHA-256 for ingest queues and background jobs. */
export async function hashFileStream(filePath: string): Promise<string> {
  const hasher = createHashUpdater()
  await pipeline(createReadStream(filePath, { highWaterMark: FILE_IO_CHUNK_SIZE }), async function* (source) {
    for await (const chunk of source) {
      hasher.update(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    yield Buffer.alloc(0)
  })
  return hasher.digest()
}
