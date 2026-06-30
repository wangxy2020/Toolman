import type { P2pSharedResource, WorkspaceEvent } from '@toolman/shared'
import {
  buildP2pNoteShareMetadata,
  P2pNotePushUpdateInputSchema,
  P2pNoteShareInputSchema,
} from '@toolman/shared'
import { getNoteById, noteToMarkdown, upsertNoteItem } from '../notes-data.service'
import { appendP2pEvent } from './p2p-event.service'
import {
  findSharedResourceInWorkspace,
  resolveSharedResourceId,
} from './p2p-shared-resource-id'
import {
  assertCanEditSharedResource,
  assertCanShareResource,
  assertWorkspaceMemberAccess,
} from './p2p-permission.guard'
import {
  exportLoroOplogBase64,
  exportPendingLoroOplog,
  getLoroDoc,
  getTextFromLoroDoc,
  initLoroDocFromText,
  markLoroVersionSynced,
  setLoroDocText,
} from './loro-note-doc'
import {
  getSharedResourceRepo,
  mapSharedResourceRow,
  noteBodyText,
  resolveNotebookName,
  readMetadataNotebookId,
} from './note-sync-utils'

function syncLoroTextToNotesData(
  noteId: string,
  content: string,
  meta?: { title?: string; notebookId?: string },
): void {
  const existing = getNoteById(noteId)
  if (existing) {
    upsertNoteItem({
      ...existing,
      content,
      updatedAt: Date.now(),
    })
    return
  }

  upsertNoteItem({
    id: noteId,
    notebookId: meta?.notebookId ?? 'notebook-default',
    title: meta?.title ?? '共享笔记',
    content,
    editorMode: 'markdown',
    blocks: [],
    tags: [],
    updatedAt: Date.now(),
  })
}

export async function shareP2pNote(rawInput: unknown): Promise<{ sharedResource: P2pSharedResource; event: WorkspaceEvent }> {
  const input = P2pNoteShareInputSchema.parse(rawInput)
  const member = assertCanShareResource(input.workspaceId)
  const note = getNoteById(input.noteId)
  if (!note) {
    throw new Error('笔记不存在')
  }

  const sharedRepo = getSharedResourceRepo()
  let resource = findSharedResourceInWorkspace(
    sharedRepo,
    input.workspaceId,
    note.id,
    'Note',
  )

  const metadata = buildP2pNoteShareMetadata({
    notebookId: note.notebookId,
    notebookName: resolveNotebookName(note.notebookId),
    title: note.title,
    editorMode: note.editorMode,
  })

  if (!resource) {
    resource = sharedRepo.create({
      id: resolveSharedResourceId(sharedRepo, note.id, input.workspaceId),
      workspaceId: input.workspaceId,
      resourceType: 'Note',
      localResourceId: note.id,
      name: note.title,
      sharedBy: member.id,
      permission: input.permission ?? 'read',
      metadataJson: metadata,
    })
  } else if (resource.status !== 'active') {
    resource =
      sharedRepo.update({
        id: resource.id,
        name: note.title,
        status: 'active',
        metadataJson: metadata,
      }) ?? resource
  } else {
    resource =
      sharedRepo.update({
        id: resource.id,
        name: note.title,
        metadataJson: metadata,
      }) ?? resource
  }

  const text = note.editorMode === 'blocks' && note.blocks?.length
    ? noteToMarkdown(note).replace(/^#\s+.+\n\n/, '')
    : noteBodyText(note)
  initLoroDocFromText(input.workspaceId, note.id, text)

  const sharedEvent = await appendP2pEvent({
    workspaceId: input.workspaceId,
    resourceType: 'Note',
    resourceId: note.id,
    operatorId: member.id,
    eventType: 'Shared',
    payload: {
      note_id: note.id,
      notebook_id: note.notebookId,
      notebook_name: resolveNotebookName(note.notebookId),
      title: note.title,
      permission: input.permission ?? 'read',
    },
  })

  const doc = getLoroDoc(input.workspaceId, note.id)
  const oplogBase64 = exportLoroOplogBase64(doc)
  await appendP2pEvent({
    workspaceId: input.workspaceId,
    resourceType: 'Note',
    resourceId: note.id,
    operatorId: member.id,
    eventType: 'Updated',
    payload: {
      note_id: note.id,
      loro_oplog: oplogBase64,
      title: note.title,
      content: text,
    },
  })

  return { sharedResource: mapSharedResourceRow(resource), event: sharedEvent }
}

export async function pushP2pNoteUpdate(rawInput: unknown): Promise<{ event: WorkspaceEvent }> {
  const input = P2pNotePushUpdateInputSchema.parse(rawInput)
  const member = assertWorkspaceMemberAccess(input.workspaceId)

  const shared = getSharedResourceRepo().findByWorkspaceAndLocalResource(
    input.workspaceId,
    input.noteId,
    'Note',
  )
  if (!shared || shared.status !== 'active') {
    throw new Error('笔记尚未共享到群组')
  }
  assertCanEditSharedResource(member, {
    permission: shared.permission,
    sharedBy: shared.sharedBy,
  })

  const doc = getLoroDoc(input.workspaceId, input.noteId)
  const loroText = getTextFromLoroDoc(doc)
  if (loroText === input.content) {
    markLoroVersionSynced(input.workspaceId, input.noteId)
    throw new Error('笔记内容未变化')
  }

  setLoroDocText(doc, input.content)
  const oplogBase64 = exportPendingLoroOplog(input.workspaceId, input.noteId)
  if (!oplogBase64) {
    throw new Error('笔记内容未变化')
  }

  const content = getTextFromLoroDoc(doc)
  syncLoroTextToNotesData(input.noteId, content, {
    title: shared.name,
    notebookId: readMetadataNotebookId(shared),
  })

  const event = await appendP2pEvent({
    workspaceId: input.workspaceId,
    resourceType: 'Note',
    resourceId: input.noteId,
    operatorId: member.id,
    eventType: 'Updated',
    payload: {
      note_id: input.noteId,
      loro_oplog: oplogBase64,
      title: shared.name,
      content,
    },
  })

  getSharedResourceRepo().update({
    id: shared.id,
    version: (shared.version ?? 1) + 1,
  })

  return { event }
}
