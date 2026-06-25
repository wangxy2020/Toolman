import { describe, expect, it, vi } from 'vitest'

import { searchWeb } from './web-search.service'

describe('web-search.service', () => {
  it('returns early message for empty query', async () => {
    await expect(searchWeb('   ')).resolves.toBe('搜索关键词为空。')
  })

  it('formats duckduckgo json results', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          Heading: 'Toolman',
          AbstractText: 'A desktop agent workspace.',
          RelatedTopics: [{ Text: 'Related topic one' }],
        }),
      })),
    )

    const result = await searchWeb('toolman', 'duckduckgo')
    expect(result).toContain('Toolman')
    expect(result).toContain('Related topic one')
    vi.unstubAllGlobals()
  })
})
