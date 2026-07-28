import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { shouldParseInWorker } from './parse-file-worker.service'

describe('shouldParseInWorker', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  function writeTemp(name: string, content: string | Buffer): string {
    const dir = mkdtempSync(join(tmpdir(), 'toolman-parse-worker-'))
    dirs.push(dir)
    const filePath = join(dir, name)
    writeFileSync(filePath, content)
    return filePath
  }

  it('does not route small markdown through the OCR worker when OCR is enabled', () => {
    const filePath = writeTemp('note.md', '# hello\n')
    expect(shouldParseInWorker(filePath, true)).toBe(false)
    expect(shouldParseInWorker(filePath, false)).toBe(false)
  })

  it('routes PDF/image through the worker when OCR is enabled', () => {
    const pdfPath = writeTemp('scan.pdf', Buffer.from('%PDF-1.4'))
    const pngPath = writeTemp('scan.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    expect(shouldParseInWorker(pdfPath, true)).toBe(true)
    expect(shouldParseInWorker(pngPath, true)).toBe(true)
    expect(shouldParseInWorker(pdfPath, false)).toBe(false)
  })

  it('routes large text files through the worker regardless of OCR', () => {
    const filePath = writeTemp('big.txt', Buffer.alloc(512 * 1024, 0x61))
    expect(shouldParseInWorker(filePath, false)).toBe(true)
  })
})
