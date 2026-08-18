import { validateHeaderValue } from 'node:http'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/toolman-mobile-sync-hub-http-test',
    getName: () => 'Toolman',
  },
}))

import { asciiContentType, contentDispositionAttachment } from './mobile-sync-hub-http'

describe('contentDispositionAttachment', () => {
  it('encodes Chinese filenames so Node will accept the header', () => {
    const raw = 'attachment; filename="报告.pdf"'
    expect(() => validateHeaderValue('Content-Disposition', raw)).toThrow(/Invalid character/)

    const encoded = contentDispositionAttachment('报告.pdf')
    expect(encoded).toContain("filename*=UTF-8''")
    expect(encoded).toContain('%')
    expect(() => validateHeaderValue('Content-Disposition', encoded)).not.toThrow()
  })

  it('keeps an ASCII fallback filename', () => {
    expect(contentDispositionAttachment('notes.pdf')).toContain('filename="notes.pdf"')
    expect(contentDispositionAttachment('a"b\\c.txt')).toContain('filename="a_b_c.txt"')
  })
})

describe('asciiContentType', () => {
  it('falls back when the type is empty or not ASCII', () => {
    expect(asciiContentType(null)).toBe('application/octet-stream')
    expect(asciiContentType('application/pdf')).toBe('application/pdf')
    expect(asciiContentType('文本/pdf')).toBe('application/octet-stream')
  })
})
