import { describe, expect, it } from 'vitest'
import {
  filterSearchableKnowledgeBaseIds,
  resolveKnowledgeRetrievalScope,
} from './knowledge-agent-scope.js'

describe('resolveKnowledgeRetrievalScope', () => {
  it('uses explicit allow when the agent is bound', () => {
    expect(
      resolveKnowledgeRetrievalScope({
        searchableKbIds: ['kb-a', 'kb-b', 'kb-c'],
        explicitAllow: ['kb-a', 'kb-files'],
        defaultAllowAll: true,
      }),
    ).toEqual(['kb-a'])
  })

  it('falls back to all searchable ids when unbound', () => {
    expect(
      resolveKnowledgeRetrievalScope({
        searchableKbIds: ['kb-a', 'kb-b'],
        explicitAllow: [],
        defaultAllowAll: true,
      }),
    ).toEqual(['kb-a', 'kb-b'])
  })

  it('applies explicit deny over allow and default', () => {
    expect(
      resolveKnowledgeRetrievalScope({
        searchableKbIds: ['kb-a', 'kb-b'],
        explicitAllow: ['kb-a', 'kb-b'],
        explicitDeny: ['kb-b'],
        defaultAllowAll: true,
      }),
    ).toEqual(['kb-a'])
  })
})

describe('filterSearchableKnowledgeBaseIds', () => {
  it('never includes local_files in RAG scope', () => {
    expect(
      filterSearchableKnowledgeBaseIds([
        { id: 'kb-local', kind: 'local' },
        { id: 'kb-files', kind: 'local_files' },
        { id: 'kb-sync', kind: 'sync' },
      ]),
    ).toEqual(['kb-local', 'kb-sync'])
  })
})
