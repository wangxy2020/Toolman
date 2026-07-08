import { describe, expect, it, vi } from 'vitest'
import {
  getAssistantKbIds,
  resolveEffectiveKbIds,
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
