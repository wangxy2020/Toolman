import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { WorkspaceEvent } from '@toolman/shared'

const sharedRepo = {
  create: vi.fn(),
  update: vi.fn(),
  findByWorkspaceAndLocalResource: vi.fn(),
  findById: vi.fn(),
}

vi.mock('../../bootstrap/database', () => ({
  getDatabase: vi.fn(() => ({})),
}))

vi.mock('@toolman/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@toolman/db')>()
  return {
    ...actual,
    P2pSharedResourceRepository: vi.fn(() => sharedRepo),
  }
})

vi.mock('../notes-data.service', () => ({
  getNoteById: vi.fn(),
  upsertNoteItem: vi.fn(),
}))

vi.mock('./p2p-event.service', () => ({
  listWorkspaceEventsSince: vi.fn(() => []),
}))

vi.mock('./p2p-shared-resource-id', () => ({
  findSharedResourceForProjection: vi.fn(() => null),
  resolveSharedResourceId: vi.fn(() => 'resource-1'),
}))

vi.mock('./p2p-shared-by-member.service', () => ({
  resolveLocalSharedByMemberId: vi.fn(() => 'member-local'),
}))

vi.mock('./note-notebook-placement', () => ({
  resolveProjectedGroupNoteNotebookId: vi.fn(() => 'group-notebook'),
}))

vi.mock('./loro-note-doc', () => ({
  applyLoroOplog: vi.fn(),
  getTextFromLoroDoc: vi.fn(() => 'merged'),
  initLoroDocFromText: vi.fn(),
}))

function noteEvent(
  partial: Partial<WorkspaceEvent> & Pick<WorkspaceEvent, 'eventType'>,
): WorkspaceEvent {
  return {
    eventId: 'evt-1',
    workspaceId: 'ws-1',
    seq: 1,
    resourceType: 'Note',
    resourceId: 'note-1',
    operatorId: 'op-1',
    timestamp: Date.now(),
    payload: {},
    sourceDeviceId: 'device-1',
    ...partial,
  }
}

describe('p2p-note-projection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('ignores non-note shared events', async () => {
    const { projectNoteSharedEvent } = await import('./p2p-note-projection')
    const notes = await import('../notes-data.service')

    projectNoteSharedEvent(
      noteEvent({
        resourceType: 'Knowledge',
        eventType: 'Shared',
      }),
    )

    expect(sharedRepo.create).not.toHaveBeenCalled()
    expect(notes.upsertNoteItem).not.toHaveBeenCalled()
  })

  it('creates shared note placeholder when note is missing locally', async () => {
    const { projectNoteSharedEvent } = await import('./p2p-note-projection')
    const notes = await import('../notes-data.service')
    vi.mocked(notes.getNoteById).mockReturnValue(null)

    projectNoteSharedEvent(
      noteEvent({
        eventType: 'Shared',
        payload: {
          note_id: 'note-1',
          title: 'Demo',
          notebook_id: 'nb-1',
          notebook_name: 'NB',
          permission: 'read',
        },
      }),
    )

    expect(sharedRepo.create).toHaveBeenCalled()
    expect(notes.upsertNoteItem).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'note-1',
        title: 'Demo',
        content: '',
        notebookId: 'group-notebook',
      }),
    )
  })

  it('marks shared resources unshared on delete', async () => {
    const { projectNoteDeletedEvent } = await import('./p2p-note-projection')
    const { findSharedResourceForProjection } = await import('./p2p-shared-resource-id')

    vi.mocked(findSharedResourceForProjection).mockReturnValue({
      id: 'resource-1',
    } as never)

    projectNoteDeletedEvent(
      noteEvent({
        eventType: 'Deleted',
        payload: { note_id: 'note-1' },
      }),
    )

    expect(sharedRepo.update).toHaveBeenCalledWith({
      id: 'resource-1',
      status: 'unshared',
    })
  })

  it('applyNoteUpdatedEvent writes merged content from payload', async () => {
    const { applyNoteUpdatedEvent } = await import('./p2p-note-projection')
    const notes = await import('../notes-data.service')
    const { findSharedResourceForProjection } = await import('./p2p-shared-resource-id')

    vi.mocked(findSharedResourceForProjection).mockReturnValue({
      id: 'resource-1',
      name: 'Shared title',
      sharedBy: 'member-local',
      metadataJson: JSON.stringify({ notebookId: 'nb-1' }),
    } as never)

    applyNoteUpdatedEvent(
      noteEvent({
        eventType: 'Updated',
        payload: {
          note_id: 'note-1',
          content: 'merged body',
        },
      }),
    )

    expect(notes.upsertNoteItem).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'note-1',
        content: 'merged body',
        title: 'Shared title',
      }),
    )
  })
})
