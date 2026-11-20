import { describe, expect, it } from 'vitest'
import { TranslationDocumentRenderPageOutputSchema } from '@toolman/shared'

describe('document-page-preview-load payload', () => {
  it('accepts binary bytes without base64', () => {
    const parsed = TranslationDocumentRenderPageOutputSchema.parse({
      totalPages: 3,
      pageNumber: 1,
      bytes: new Uint8Array([0xff, 0xd8, 0xff]),
      mimeType: 'image/jpeg',
      width: 720,
      height: 900,
    })
    expect(parsed.bytes?.byteLength).toBe(3)
    expect(parsed.base64).toBeUndefined()
  })

  it('still accepts legacy base64 payloads', () => {
    const parsed = TranslationDocumentRenderPageOutputSchema.parse({
      totalPages: 1,
      pageNumber: 1,
      base64: 'abcd',
      mimeType: 'image/jpeg',
      width: 100,
      height: 100,
    })
    expect(parsed.base64).toBe('abcd')
  })
})
