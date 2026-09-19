import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  cacheUsablePdfPage,
  loadUsableCachedPdfPages,
  PDF_PAGE_PARSER_VERSION,
  readCachedPdfPage,
} from './pdf-page-cache.js'

const PROSE = '小说写作首先要建立场景。读者必须看见人物正在做什么，而不是听作者转述已经发生的事。'

describe('pdf page cache', () => {
  it('reuses usable pages for the same content hash and parser version', () => {
    const dir = mkdtempSync(join(tmpdir(), 'toolman-parsed-'))
    try {
      cacheUsablePdfPage({
        parsedDir: dir,
        contentHash: 'abc123',
        pageNumber: 2,
        text: PROSE,
        engine: 'hybrid',
        qualityScore: 'ok',
        documentId: 'doc-1',
      })
      const loaded = loadUsableCachedPdfPages(dir, 'abc123')
      expect(loaded.get(2)?.parserVersion).toBe(PDF_PAGE_PARSER_VERSION)
      expect(loaded.get(2)?.parsedText).toBe(PROSE)
      expect(readCachedPdfPage(dir, 'abc123', 1)).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('does not cache ISBN debris', () => {
    const dir = mkdtempSync(join(tmpdir(), 'toolman-parsed-'))
    try {
      cacheUsablePdfPage({
        parsedDir: dir,
        contentHash: 'abc123',
        pageNumber: 1,
        text: 'ISBN 978-7-300-13030-9',
        engine: 'hybrid',
        qualityScore: 'digit-noise',
      })
      expect(loadUsableCachedPdfPages(dir, 'abc123').size).toBe(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
