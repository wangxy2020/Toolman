import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { hashFileBytes, hashFileStream } from './file-hash.js'
import { copyFileChunkedSync } from './file-io.js'

function expectedSha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

describe('file hash utilities', () => {
  it('hashes small and large files consistently', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'toolman-hash-'))
    const filePath = join(dir, 'sample.bin')
    const bytes = Buffer.alloc(256 * 1024, 0x7a)
    writeFileSync(filePath, bytes)

    const expected = expectedSha256(bytes)
    expect(hashFileBytes(filePath)).toBe(expected)
    await expect(hashFileStream(filePath)).resolves.toBe(expected)

    rmSync(dir, { recursive: true, force: true })
  })

  it('copies files without changing hash', () => {
    const dir = mkdtempSync(join(tmpdir(), 'toolman-copy-'))
    const sourcePath = join(dir, 'source.bin')
    const targetPath = join(dir, 'target.bin')
    writeFileSync(sourcePath, Buffer.from('chunked-copy'))

    copyFileChunkedSync(sourcePath, targetPath)
    expect(hashFileBytes(targetPath)).toBe(hashFileBytes(sourcePath))

    rmSync(dir, { recursive: true, force: true })
  })
})
