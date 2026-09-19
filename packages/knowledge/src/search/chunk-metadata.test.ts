import { describe, expect, it } from 'vitest'
import { parseChunkMetadata } from './chunk-metadata.js'

describe('parseChunkMetadata', () => {
  it('keeps PDF page numbers from chunk metadata', () => {
    expect(parseChunkMetadata(JSON.stringify({ pageNumber: 37, heading: '保险责任' }))).toEqual({
      pageNumber: 37,
      heading: '保险责任',
    })
  })

  it('returns empty object for invalid json', () => {
    expect(parseChunkMetadata('{')).toEqual({})
  })
})
