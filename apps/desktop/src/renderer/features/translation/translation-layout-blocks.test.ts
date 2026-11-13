import { describe, expect, it } from 'vitest'
import { hasUsableLayoutBlocks, normalizeLayoutBlocks } from './translation-layout-blocks'

describe('normalizeLayoutBlocks', () => {
  it('keeps valid normalized geometry and drops invalid boxes', () => {
    const blocks = normalizeLayoutBlocks([
      {
        id: 't1',
        kind: 'title',
        bbox: { x: 0.1, y: 0.05, w: 0.8, h: 0.08 },
        sourceText: 'FORM OF AGREEMENT',
        translatedText: '协议格式',
      },
      {
        id: 'bad',
        kind: 'paragraph',
        bbox: { x: 0, y: 0, w: 0, h: 0.2 },
        sourceText: 'gone',
      },
    ])
    expect(blocks).toHaveLength(1)
    expect(blocks?.[0]?.translatedText).toBe('协议格式')
    expect(hasUsableLayoutBlocks(blocks)).toBe(true)
  })

  it('returns undefined for empty or unusable input', () => {
    expect(normalizeLayoutBlocks([])).toBeUndefined()
    expect(normalizeLayoutBlocks([{ id: 'x' }])).toBeUndefined()
    expect(hasUsableLayoutBlocks(undefined)).toBe(false)
  })
})
