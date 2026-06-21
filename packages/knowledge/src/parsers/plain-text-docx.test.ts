import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'

import { writePlainTextDocx } from './plain-text-docx.js'

describe('writePlainTextDocx', () => {
  it('writes a minimal docx zip with paragraph text', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'toolman-docx-'))
    const outputPath = join(dir, 'out.docx')

    try {
      await writePlainTextDocx(outputPath, '第一段\n第二段')
      const buffer = readFileSync(outputPath)
      expect(buffer[0]).toBe(0x50)
      expect(buffer[1]).toBe(0x4b)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
