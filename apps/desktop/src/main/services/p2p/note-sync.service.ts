import {
  P2pSharedResourceRepository,
  type P2pSharedResourceRow,
} from '@toolman/db'
import type { P2pSharedResource, WorkspaceEvent } from '@toolman/shared'
import {
  P2pNotePushUpdateInputSchema,
  P2pNoteSetPermissionInputSchema,
  P2pNoteShareInputSchema,
  P2pResourceListInputSchema,
  P2pResourceUnshareInputSchema,
  buildP2pNoteShareMetadata,
  parseP2pNoteShareMetadata,
} from '@toolman/shared'
import { getDatabase } from '../../bootstrap/database'
import { getNoteById, getNotesData, noteToMarkdown, upsertNoteItem } from '../notes-data.service'
import { appendP2pEvent } from './p2p-event.service'
import {
  findSharedResourceInWorkspace,
  resolveSharedResourceId,
} from './p2p-shared-resource-id'
import {
  assertCanEditSharedResource,
  assertCanManageSharedResource,
  assertCanShareResource,
  assertWorkspaceMemberAccess,
} from './p2p-permission.guard'
import {
  exportLoroOplogBase64,
  exportPendingLoroOplog,
  getLoroDoc,
  getTextFromLoroDoc,
  initLoroDocFromText,
  setLoroDocText,
} from './loro-note-doc'

function getSharedResourceRepo(): P2pSharedResourceRepository {
  return new P2pSharedResourceRepository(getDatabase())
}

function mapSharedResourceRow(row: P2pSharedResourceRow): P2pSharedResource {
  const base: P2pSharedResource = {
    id: row.id,
    workspaceId: row.workspaceId,
    resourceType: row.resourceType,
    localResourceId: row.localResourceId,
    name: row.name,
    sharedBy: row.sharedBy,
    permission: row.permission,
    contentHash: row.contentHash,
    version: row.version ?? 1,
    status: row.status,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  }

  if (row.resourceType !== 'Note') {
    return base
  }

  const meta = parseP2pNoteShareMetadata(row.metadataJson)
  if (!meta) {
    return base
  }

  return {
    ...base,
    notebookId: meta.notebookId,
    notebookName: meta.notebookName,
  }
}

function resolveNotebookName(notebookId: string): string {
  const notebook = getNotesData().notebooks.find((item) => item.id === notebookId)
  return notebook?.name?.trim() || '笔记本'
}

function noteBodyText(note: NonNullable<ReturnType<typeof getNoteById>>): string {
  if (note.editorMode === 'blocks' && note.blocks?.length) {
    return noteToMarkdown(note).replace(/^#\s+.+\n\n/, '')
  }
  return note.content
}

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

  const text = noteBodyText(note)
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

export async function setP2pNotePermission(rawInput: unknown): Promise<{
  sharedResource: P2pSharedResource
  event: WorkspaceEvent
}> {
  const input = P2pNoteSetPermissionInputSchema.parse(rawInput)
  const member = assertWorkspaceMemberAccess(input.workspaceId)
  const sharedRepo = getSharedResourceRepo()
  const resource = sharedRepo.findById(input.resourceId)
  if (!resource || resource.workspaceId !== input.workspaceId || resource.resourceType !== 'Note') {
    throw new Error('共享资源不存在')
  }
  if (resource.status !== 'active') {
    throw new Error('共享资源不存在')
  }

  assertCanManageSharedResource(input.workspaceId, resource.sharedBy)

  const updated =
    sharedRepo.update({
      id: resource.id,
      permission: input.permission,
    }) ?? resource

  const noteId = resource.localResourceId ?? resource.id
  const event = await appendP2pEvent({
    workspaceId: input.workspaceId,
    resourceType: 'Note',
    resourceId: noteId,
    operatorId: member.id,
    eventType: 'Updated',
    payload: {
      note_id: noteId,
      permission: input.permission,
    },
  })

  return { sharedResource: mapSharedResourceRow(updated), event }
}

function readMetadataNotebookId(resource: P2pSharedResourceRow): string | undefined {
  try {
    const metadata = JSON.parse(resource.metadataJson) as { notebookId?: string }
    return typeof metadata.notebookId === 'string' ? metadata.notebookId : undefined
  } catch {
    return undefined
  }
}

export async function unshareP2pNote(rawInput: unknown): Promise<{ unshared: true }> {
  const input = P2pResourceUnshareInputSchema.parse(rawInput)
  const sharedRepo = getSharedResourceRepo()
  const resource = sharedRepo.findById(input.resourceId)
  if (!resource || resource.workspaceId !== input.workspaceId) {
    throw new Error('共享资源不存在')
  }
  if (resource.resourceType !== 'Note') {
    throw new Error('只能取消共享笔记资源')
  }
  const member = assertCanManageSharedResource(input.workspaceId, resource.sharedBy)

  sharedRepo.update({ id: resource.id, status: 'unshared' })

  await appendP2pEvent({
    workspaceId: input.workspaceId,
    resourceType: 'Note',
    resourceId: resource.localResourceId ?? resource.id,
    operatorId: member.id,
    eventType: 'Deleted',
    payload: {
      note_id: resource.localResourceId ?? resource.id,
    },
  })

  return { unshared: true }
}

export function listP2pSharedNotes(rawInput: unknown): { resources: P2pSharedResource[] } {
  const input = P2pResourceListInputSchema.parse(rawInput)
  assertWorkspaceMemberAccess(input.workspaceId)

  const rows = getSharedResourceRepo()
    .listByWorkspace(input.workspaceId)
    .filter((row) => row.resourceType === 'Note')
    .filter((row) => (input.status ? row.status === input.status : row.status === 'active'))

  return { resources: rows.map(mapSharedResourceRow) }
}

export function listP2pNoteShareTargets(noteId: string): { workspaceIds: string[] } {
  const rows = getSharedResourceRepo().listActiveByLocalResource(noteId, 'Note')
  return { workspaceIds: rows.map((row) => row.workspaceId) }
}
