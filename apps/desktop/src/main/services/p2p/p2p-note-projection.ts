import type { WorkspaceEvent } from '@toolman/shared'
import { P2pSharedResourceRepository } from '@toolman/db'
import { buildP2pNoteShareMetadata } from '@toolman/shared'
import { getDatabase } from '../../bootstrap/database'
import { getNoteById, upsertNoteItem } from '../notes-data.service'
import { listWorkspaceEventsSince } from './p2p-event.service'
import {
  applyLoroOplog,
  getTextFromLoroDoc,
  initLoroDocFromText,
} from './loro-note-doc'

import { findSharedResourceForProjection, resolveSharedResourceId } from './p2p-shared-resource-id'
import { resolveLocalSharedByMemberId } from './p2p-shared-by-member.service'

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
  const existing = findSharedResourceForProjection(
    sharedRepo,
    event.workspaceId,
    noteId,
    'Note',
  )
  const resourceId = existing?.id ?? resolveSharedResourceId(sharedRepo, noteId, event.workspaceId)
  const metadataJson = buildP2pNoteShareMetadata({ notebookId, notebookName, title })
  const sharedBy = resolveLocalSharedByMemberId(
    event.workspaceId,
    event.operatorId,
    event.sourceDeviceId,
  )
  if (!existing) {
    sharedRepo.create({
      id: resourceId,
      workspaceId: event.workspaceId,
      resourceType: 'Note',
      localResourceId: noteId,
      name: title,
      sharedBy,
      permission,
      metadataJson,
      createdAt: new Date(event.timestamp),
      updatedAt: new Date(event.timestamp),
    })
  } else {
    sharedRepo.update({
      id: resourceId,
      name: title,
      status: 'active',
      permission,
      metadataJson,
      ...(existing.sharedBy !== sharedBy ? { sharedBy } : {}),
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
  const resource = findSharedResourceForProjection(
    sharedRepo,
    event.workspaceId,
    noteId,
    'Note',
  )
  if (resource) {
    sharedRepo.update({ id: resource.id, status: 'unshared' })
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

export function reconcileNoteSharedResources(workspaceId: string): void {
  const terminalByNote = new Map<string, WorkspaceEvent>()

  let sinceSeq = 0
  while (true) {
    const batch = listWorkspaceEventsSince(workspaceId, sinceSeq, 200)
    if (batch.length === 0) break

    for (const event of batch) {
      sinceSeq = event.seq
      if (event.resourceType !== 'Note') continue
      if (
        event.eventType !== 'Shared' &&
        event.eventType !== 'Created' &&
        event.eventType !== 'Deleted'
      ) {
        continue
      }

      const noteId =
        typeof event.payload.note_id === 'string' ? event.payload.note_id : event.resourceId
      terminalByNote.set(noteId, event)
    }

    if (batch.length < 200) break
  }

  for (const event of terminalByNote.values()) {
    if (event.eventType === 'Deleted') {
      projectNoteDeletedEvent(event)
      continue
    }
    projectNoteSharedEvent(event)
  }
}
