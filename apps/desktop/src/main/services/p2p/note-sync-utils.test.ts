import { describe, expect, it, vi } from 'vitest'
import type { P2pSharedResourceRow } from '@toolman/db'

vi.mock('../../bootstrap/database', () => ({
  getDatabase: vi.fn(() => ({})),
}))

vi.mock('../notes-data.service', () => ({
  getNotesData: vi.fn(() => ({
    notebooks: [{ id: 'nb-1', name: '工作笔记' }],
  })),
  getNoteById: vi.fn(),
  noteToMarkdown: vi.fn(() => '# Title\n\nblock body'),
}))

import {
  getSharedResourceRepo,
  mapSharedResourceRow,
  noteBodyText,
  readMetadataNotebookId,
  resolveNotebookName,
} from './note-sync-utils'

function noteRow(overrides: Partial<P2pSharedResourceRow> = {}): P2pSharedResourceRow {
  return {
    id: 'resource-1',
    workspaceId: 'ws-1',
    resourceType: 'Note',
    localResourceId: 'note-1',
    name: 'Demo',
    sharedBy: 'member-1',
    permission: 'write',
    contentHash: null,
    version: 2,
    status: 'active',
    metadataJson: JSON.stringify({
      notebookId: 'nb-1',
      notebookName: 'NB',
      title: 'Demo',
    }),
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
    ...overrides,
  }
}

describe('note-sync-utils', () => {
  it('getSharedResourceRepo constructs repository with database', () => {
    expect(getSharedResourceRepo()).toBeTruthy()
  })

  it('mapSharedResourceRow maps note metadata fields', () => {
    expect(mapSharedResourceRow(noteRow())).toEqual(
      expect.objectContaining({
        id: 'resource-1',
        notebookId: 'nb-1',
        notebookName: 'NB',
        version: 2,
        createdAt: new Date('2026-01-01T00:00:00Z').getTime(),
      }),
    )
  })

  it('mapSharedResourceRow skips note metadata for non-note resources', () => {
    const row = mapSharedResourceRow(
      noteRow({
        resourceType: 'Knowledge',
        metadataJson: JSON.stringify({ notebookId: 'nb-1' }),
      }),
    )
    expect(row).not.toHaveProperty('notebookId')
  })

  it('resolveNotebookName falls back when notebook is missing', () => {
    expect(resolveNotebookName('missing')).toBe('笔记本')
    expect(resolveNotebookName('nb-1')).toBe('工作笔记')
  })

  it('noteBodyText returns markdown body for block notes', () => {
    const note = {
      editorMode: 'blocks' as const,
      blocks: [{ type: 'paragraph', content: 'x' }],
      content: 'ignored',
    }
    expect(noteBodyText(note as never)).toBe('block body')
  })

  it('noteBodyText returns raw content for markdown notes', () => {
    expect(
      noteBodyText({
        editorMode: 'markdown',
        content: 'plain markdown',
        blocks: [],
      } as never),
    ).toBe('plain markdown')
  })

  it('readMetadataNotebookId reads notebook id from metadata json', () => {
    expect(readMetadataNotebookId(noteRow())).toBe('nb-1')
    expect(readMetadataNotebookId(noteRow({ metadataJson: '{' }))).toBeUndefined()
  })
})
