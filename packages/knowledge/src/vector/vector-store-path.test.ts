import { describe, expect, it } from 'vitest'
import { getKbLanceDir, getKbVectorStorePath } from './file-vector-store.js'

describe('versioned vector store paths', () => {
  it('keeps index v1 on the historical filename', () => {
    expect(getKbVectorStorePath('/vectors', 'kb-1')).toBe('/vectors/kb_kb-1.vectors.json')
    expect(getKbVectorStorePath('/vectors', 'kb-1', 1)).toBe('/vectors/kb_kb-1.vectors.json')
    expect(getKbLanceDir('/vectors', 1)).toBe('/vectors/lance')
  })

  it('isolates later index versions on sibling files/dirs', () => {
    expect(getKbVectorStorePath('/vectors', 'kb-1', 2)).toBe('/vectors/kb_kb-1.v2.vectors.json')
    expect(getKbLanceDir('/vectors', 2)).toBe('/vectors/lance-v2')
  })
})
