import { closeSync, openSync, readSync, writeSync } from 'node:fs'
import { FILE_IO_CHUNK_SIZE } from './file-hash.js'

export { FILE_IO_CHUNK_SIZE }

/** Copy a file in fixed-size chunks without loading it entirely into memory. */
export function copyFileChunkedSync(sourcePath: string, targetPath: string): void {
  const fdSrc = openSync(sourcePath, 'r')
  const fdDst = openSync(targetPath, 'w')
  const buffer = Buffer.alloc(FILE_IO_CHUNK_SIZE)
  try {
    let bytesRead = 0
    while ((bytesRead = readSync(fdSrc, buffer, 0, buffer.length, null)) > 0) {
      writeSync(fdDst, buffer, 0, bytesRead)
    }
  } finally {
    closeSync(fdSrc)
    closeSync(fdDst)
  }
}
