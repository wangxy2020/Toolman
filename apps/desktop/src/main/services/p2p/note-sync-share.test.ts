import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const USER_DATA = join(tmpdir(), 'toolman-note-sync-share-test')

const WORKSPACE_ID = '00000000-0000-4000-8000-000000000001'
const NOTE_ID = 'note-1'

const sharedRow = {
  id: 'resource-1',
  workspaceId: WORKSPACE_ID,
  localResourceId: NOTE_ID,
  name: 'Demo note',
  sharedBy: 'member-1',
  permission: 'write' as const,
  status: 'active' as const,
  version: 1,
  metadataJson: JSON.stringify({ notebookId: 'nb-1' }),
}

const sharedRepo = {
  findByWorkspaceAndLocalResource: vi.fn(() => sharedRow),
  update: vi.fn(),
}

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => (name === 'userData' ? USER_DATA : join(USER_DATA, name)),
  },
}))

vi.mock('./note-sync-utils', () => ({
  getSharedResourceRepo: vi.fn(() => sharedRepo),
  mapSharedResourceRow: vi.fn((row: unknown) => row),
  noteBodyText: vi.fn(),
  resolveNotebookName: vi.fn(),
  readMetadataNotebookId: vi.fn(() => 'nb-1'),
}))

vi.mock('./p2p-permission.guard', () => ({
  assertWorkspaceMemberAccess: vi.fn(() => ({ id: 'member-1' })),
  assertCanEditSharedResource: vi.fn(),
  assertCanShareResource: vi.fn(),
}))

vi.mock('./p2p-event.service', () => ({
  appendP2pEvent: vi.fn(async () => ({
    eventId: 'evt-1',
    workspaceId: 'ws-1',
    seq: 2,
    resourceType: 'Note',
    resourceId: 'note-1',
    operatorId: 'member-1',
    eventType: 'Updated',
    timestamp: Date.now(),
    payload: {},
    sourceDeviceId: 'device-1',
  })),
}))

vi.mock('../notes-data.service', () => ({
  getNoteById: vi.fn(),
  upsertNoteItem: vi.fn(),
  noteToMarkdown: vi.fn(),
}))

describe('note-sync-share', () => {
  beforeEach(() => {
    rmSync(USER_DATA, { recursive: true, force: true })
    mkdtempSync(USER_DATA)
    vi.clearAllMocks()
  })

  it('pushP2pNoteUpdate rejects unchanged content without appending events', async () => {
    const { initLoroDocFromText, clearLoroDocCache } = await import('./loro-note-doc')
    const { pushP2pNoteUpdate } = await import('./note-sync-share')
    const { appendP2pEvent } = await import('./p2p-event.service')

    initLoroDocFromText(WORKSPACE_ID, NOTE_ID, 'same content')
    clearLoroDocCache(WORKSPACE_ID, NOTE_ID)

    await expect(
      pushP2pNoteUpdate({
        workspaceId: WORKSPACE_ID,
        noteId: NOTE_ID,
        content: 'same content',
      }),
    ).rejects.toThrow('笔记内容未变化')

    expect(appendP2pEvent).not.toHaveBeenCalled()
    expect(sharedRepo.update).not.toHaveBeenCalled()
  })

  it('pushP2pNoteUpdate appends Updated event when content changes', async () => {
    const { initLoroDocFromText, clearLoroDocCache } = await import('./loro-note-doc')
    const { pushP2pNoteUpdate } = await import('./note-sync-share')
    const { appendP2pEvent } = await import('./p2p-event.service')
    const notes = await import('../notes-data.service')

    initLoroDocFromText(WORKSPACE_ID, NOTE_ID, 'before')
    clearLoroDocCache(WORKSPACE_ID, NOTE_ID)

    const result = await pushP2pNoteUpdate({
      workspaceId: WORKSPACE_ID,
      noteId: NOTE_ID,
      content: 'after',
    })

    expect(result.event.eventType).toBe('Updated')
    expect(appendP2pEvent).toHaveBeenCalled()
    expect(sharedRepo.update).toHaveBeenCalled()
    expect(notes.upsertNoteItem).toHaveBeenCalledWith(
      expect.objectContaining({
        id: NOTE_ID,
        content: 'after',
      }),
    )
  })
})
