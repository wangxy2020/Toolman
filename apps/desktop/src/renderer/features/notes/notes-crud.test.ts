import { describe, expect, it } from 'vitest'
import { buildGroupNotebookId } from '@toolman/shared'
import {
  buildNoteTitle,
  buildNotebookName,
  createEmptyNote,
  DEFAULT_NOTEBOOK_ID,
  mergeNotesData,
  normalizeData,
  normalizeTag,
} from './notes-storage'
import { collectAllTags, searchNotes } from './notes-search'

describe('normalizeData', () => {
  it('ensures default notebook exists and filters orphan notes', () => {
    const data = normalizeData({
      notebooks: [{ id: 'nb-1', name: '工作' }],
      notes: [
        { ...createEmptyNote('nb-1', 'A'), content: 'hello' },
        { ...createEmptyNote('missing', 'B'), content: 'world' },
      ],
      syncFolderPath: '/tmp/notes',
    })

    expect(data.notebooks.some((item) => item.id === DEFAULT_NOTEBOOK_ID)).toBe(true)
    expect(data.notes).toHaveLength(1)
    expect(data.notes[0]?.title).toBe('A')
    expect(data.syncFolderPath).toBe('/tmp/notes')
  })
})

describe('mergeNotesData', () => {
  it('keeps group notebook placement when remote copy is newer but uses default notebook', () => {
    const groupNotebookId = buildGroupNotebookId('ws-1')
    const noteId = 'note-shared-1'
    const localNote = {
      ...createEmptyNote(groupNotebookId, '共享笔记'),
      id: noteId,
      groupPermissionLocked: true,
      locked: true,
      updatedAt: 100,
    }
    const remoteNote = {
      ...createEmptyNote(DEFAULT_NOTEBOOK_ID, '共享笔记'),
      id: noteId,
      updatedAt: 200,
    }

    const merged = mergeNotesData(
      {
        notebooks: [
          { id: DEFAULT_NOTEBOOK_ID, name: '默认笔记本', isDefault: true },
          { id: groupNotebookId, name: '测试群' },
        ],
        notes: [localNote],
        syncFolderPath: null,
      },
      {
        notebooks: [{ id: DEFAULT_NOTEBOOK_ID, name: '默认笔记本', isDefault: true }],
        notes: [remoteNote],
        syncFolderPath: null,
      },
    )

    expect(merged.notes).toHaveLength(1)
    expect(merged.notes[0]?.notebookId).toBe(groupNotebookId)
    expect(merged.notes[0]?.locked).toBe(true)
    expect(merged.notes[0]?.groupPermissionLocked).toBe(true)
    expect(merged.notebooks.some((item) => item.id === groupNotebookId)).toBe(true)
  })
})

describe('notes naming helpers', () => {
  it('builds unique notebook names', () => {
    const existing = [
      { id: DEFAULT_NOTEBOOK_ID, name: '默认笔记本', isDefault: true },
      { id: 'nb-1', name: '笔记本', isDefault: false },
    ]
    expect(buildNotebookName(existing)).toBe('笔记本 2')
  })

  it('builds unique note titles in a notebook', () => {
    const notes = [
      createEmptyNote(DEFAULT_NOTEBOOK_ID, '2026/6/13'),
      createEmptyNote(DEFAULT_NOTEBOOK_ID, '2026/6/13 (2)'),
    ]
    const title = buildNoteTitle(notes, DEFAULT_NOTEBOOK_ID, new Date('2026-06-13'))
    expect(title).toBe('2026/6/13 (3)')
  })
})

describe('searchNotes', () => {
  const notes = [
    {
      ...createEmptyNote(DEFAULT_NOTEBOOK_ID, 'RAG 设计'),
      content: '向量检索与全文检索融合',
      tags: ['rag'],
      updatedAt: 10,
    },
    {
      ...createEmptyNote(DEFAULT_NOTEBOOK_ID, '会议纪要'),
      content: '讨论笔记 CRUD',
      tags: ['meeting'],
      updatedAt: 20,
    },
  ]

  it('scores title and tag matches', () => {
    const results = searchNotes(notes, 'rag')
    expect(results[0]?.note.title).toBe('RAG 设计')
    expect(results[0]?.score).toBeGreaterThan(0)
  })

  it('filters by notebook and tag', () => {
    const results = searchNotes(notes, '', { tag: 'meeting' })
    expect(results).toHaveLength(1)
    expect(results[0]?.note.title).toBe('会议纪要')
  })
})

describe('normalizeTag', () => {
  it('strips leading hash and empty values', () => {
    expect(normalizeTag('#rag')).toBe('rag')
    expect(normalizeTag('  ')).toBeNull()
  })
})

describe('collectAllTags', () => {
  it('returns sorted unique tags', () => {
    const notes = [
      { ...createEmptyNote(DEFAULT_NOTEBOOK_ID, 'A'), tags: ['beta', 'alpha'] },
      { ...createEmptyNote(DEFAULT_NOTEBOOK_ID, 'B'), tags: ['alpha'] },
    ]
    expect(collectAllTags(notes)).toEqual(['alpha', 'beta'])
  })
})
