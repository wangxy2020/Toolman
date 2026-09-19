import { describe, expect, it, vi } from 'vitest'
import {
  getAssistantKbIds,
  resolveEffectiveKbIds,
  formatSearchLocalKnowledgeHits,
} from './tool-api'

const listByWorkspace = vi.fn()

vi.mock('../../db/repos', () => ({
  getKnowledgeBaseRepository: () => ({
    listByWorkspace,
  }),
}))

describe('resolveEffectiveKbIds', () => {
  it('returns bound searchable KB ids when assistant has bindings', () => {
    listByWorkspace.mockReturnValue([
      { id: 'kb-local', kind: 'local' },
      { id: 'kb-files', kind: 'local_files' },
    ])

    const ids = resolveEffectiveKbIds({
      workspaceId: 'ws-1',
      assistant: { kbIdsJson: JSON.stringify(['kb-local', 'kb-files', 'missing']) },
    })

    expect(ids).toEqual(['kb-local'])
  })

  it('returns all searchable workspace KBs when assistant is unbound', () => {
    listByWorkspace.mockReturnValue([
      { id: 'kb-local', kind: 'local' },
      { id: 'kb-network', kind: 'network' },
      { id: 'kb-files', kind: 'local_files' },
    ])

    const ids = resolveEffectiveKbIds({
      workspaceId: 'ws-1',
      assistant: { kbIdsJson: '[]' },
    })

    expect(ids).toEqual(['kb-local', 'kb-network'])
  })

  it('falls back to all searchable KBs when bound ids no longer exist', () => {
    listByWorkspace.mockReturnValue([
      { id: 'kb-local', kind: 'local' },
      { id: 'kb-network', kind: 'network' },
    ])

    const ids = resolveEffectiveKbIds({
      workspaceId: 'ws-1',
      assistant: { kbIdsJson: JSON.stringify(['deleted-kb']) },
    })

    expect(ids).toEqual(['kb-local', 'kb-network'])
  })

  it('prefers sendOptions override over assistant bindings', () => {
    listByWorkspace.mockReturnValue([
      { id: 'kb-a', kind: 'local' },
      { id: 'kb-b', kind: 'local' },
    ])

    const ids = resolveEffectiveKbIds({
      workspaceId: 'ws-1',
      assistant: { kbIdsJson: JSON.stringify(['kb-a']) },
      overrideKbIds: ['kb-b'],
    })

    expect(ids).toEqual(['kb-b'])
  })
})

describe('getAssistantKbIds', () => {
  it('parses kb id arrays from assistant row json', () => {
    expect(getAssistantKbIds({ kbIdsJson: JSON.stringify(['a', 'b']) })).toEqual(['a', 'b'])
    expect(getAssistantKbIds(null)).toEqual([])
    expect(getAssistantKbIds({ kbIdsJson: 'not-json' })).toEqual([])
  })
})

describe('formatSearchLocalKnowledgeHits', () => {
  it('includes document, page_number, chunk, and source text', () => {
    expect(
      formatSearchLocalKnowledgeHits([
        {
          kbName: '本地知识库',
          documentTitle: '小说写作教程.pdf',
          score: 0.81,
          text: '【第 12 页/289】\n第五章 场景',
          pageNumber: 12,
          chunkIndex: 4,
        },
      ]),
    ).toContain('document=小说写作教程.pdf page_number=12 chunk=4')
  })
})
