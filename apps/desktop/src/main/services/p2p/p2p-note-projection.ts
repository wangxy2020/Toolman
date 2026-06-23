import type { WorkspaceEvent } from '@toolman/shared'
import { P2pSharedResourceRepository } from '@toolman/db'
import { buildP2pNoteShareMetadata } from '@toolman/shared'
import { getDatabase } from '../../bootstrap/database'
import { getNoteById, upsertNoteItem } from '../notes-data.service'
import {
  applyLoroOplog,
  getTextFromLoroDoc,
  initLoroDocFromText,
} from './loro-note-doc'

function getSharedResourceRepo(): P2pSharedResourceRepository {
  return new P2pSharedResourceRepository(getDatabase())
}

function readPayloadString(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key]
  return typeof value === 'string' ? value : undefined
}

export function projectNoteSharedEvent(event: WorkspaceEvent): void {
  if (event.resourceType !== 'Note') {
    return
  }
  if (event.eventType !== 'Shared' && event.eventType !== 'Created') {
    return
  }

  const noteId = readPayloadString(event.payload, 'note_id') ?? event.resourceId
  const title = readPayloadString(event.payload, 'title') ?? '共享笔记'
  const notebookId = readPayloadString(event.payload, 'notebook_id') ?? 'notebook-default'
  const notebookName = readPayloadString(event.payload, 'notebook_name') ?? '笔记本'
  const permission =
    readPayloadString(event.payload, 'permission') === 'write' ? 'write' : 'read'

  const sharedRepo = getSharedResourceRepo()
  const existing = sharedRepo.findById(noteId)
  const metadataJson = buildP2pNoteShareMetadata({ notebookId, notebookName, title })
  if (!existing) {
    sharedRepo.create({
      id: noteId,
      workspaceId: event.workspaceId,
      resourceType: 'Note',
      localResourceId: noteId,
      name: title,
      sharedBy: event.operatorId,
      permission,
      metadataJson,
      createdAt: new Date(event.timestamp),
      updatedAt: new Date(event.timestamp),
    })
  } else if (existing.status === 'active') {
    sharedRepo.update({
      id: noteId,
      name: title,
      permission,
      metadataJson,
    })
  }

  if (getNoteById(noteId)) {
    return
  }

  upsertNoteItem({
    id: noteId,
    notebookId,
    title,
    content: '',
    editorMode: 'markdown',
    blocks: [],
    tags: [],
    updatedAt: event.timestamp,
  })
}

export function projectNoteDeletedEvent(event: WorkspaceEvent): void {
  if (event.resourceType !== 'Note' || event.eventType !== 'Deleted') {
    return
  }

  const noteId = readPayloadString(event.payload, 'note_id') ?? event.resourceId
  const sharedRepo = getSharedResourceRepo()
  const resource = sharedRepo.findById(noteId)
  if (resource) {
    sharedRepo.update({ id: noteId, status: 'unshared' })
  }
}

export function applyNoteUpdatedEvent(event: WorkspaceEvent): void {
  if (event.resourceType !== 'Note' || event.eventType !== 'Updated') {
    return
  }

  const noteId = readPayloadString(event.payload, 'note_id') ?? event.resourceId
  const permission = readPayloadString(event.payload, 'permission')
  const oplogBase64 = readPayloadString(event.payload, 'loro_oplog')
  const contentFromPayload = readPayloadString(event.payload, 'content')
  const title = readPayloadString(event.payload, 'title') ?? '共享笔记'

  const sharedRepo = getSharedResourceRepo()
  if (permission === 'read' || permission === 'write') {
    const resource = sharedRepo.findById(noteId)
    if (resource) {
      sharedRepo.update({ id: noteId, permission })
    }
    if (!oplogBase64 && contentFromPayload == null) {
      return
    }
  }

  if (!oplogBase64 && contentFromPayload == null) {
    return
  }

  const shared = sharedRepo.findById(noteId)
  let notebookId = 'notebook-default'
  if (shared) {
    try {
      const metadata = JSON.parse(shared.metadataJson) as { notebookId?: string }
      if (metadata.notebookId) notebookId = metadata.notebookId
    } catch {
      // ignore
    }
  }

  const doc = oplogBase64
    ? applyLoroOplog(event.workspaceId, noteId, oplogBase64)
    : null
  const content = contentFromPayload ?? (doc ? getTextFromLoroDoc(doc) : '')
  if (!content && !oplogBase64) {
    return
  }

  upsertNoteItem({
    id: noteId,
    notebookId,
    title: shared?.name ?? title,
    content,
    editorMode: 'markdown',
    blocks: [],
    tags: [],
    updatedAt: event.timestamp,
  })
}

export function ensureNoteLoroFromContent(
  workspaceId: string,
  noteId: string,
  content: string,
): void {
  initLoroDocFromText(workspaceId, noteId, content)
}
