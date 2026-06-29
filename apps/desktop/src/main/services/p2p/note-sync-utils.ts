import {
  P2pSharedResourceRepository,
  type P2pSharedResourceRow,
} from '@toolman/db'
import type { P2pSharedResource } from '@toolman/shared'
import { parseP2pNoteShareMetadata } from '@toolman/shared'
import { getDatabase } from '../../bootstrap/database'
import { getNoteById, getNotesData, noteToMarkdown } from '../notes-data.service'

export function getSharedResourceRepo(): P2pSharedResourceRepository {
  return new P2pSharedResourceRepository(getDatabase())
}

export function mapSharedResourceRow(row: P2pSharedResourceRow): P2pSharedResource {
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

export function resolveNotebookName(notebookId: string): string {
  const notebook = getNotesData().notebooks.find((item) => item.id === notebookId)
  return notebook?.name?.trim() || '笔记本'
}

export function noteBodyText(note: NonNullable<ReturnType<typeof getNoteById>>): string {
  if (note.editorMode === 'blocks' && note.blocks?.length) {
    return noteToMarkdown(note).replace(/^#\s+.+\n\n/, '')
  }
  return note.content
}

export function readMetadataNotebookId(resource: P2pSharedResourceRow): string | undefined {
  try {
    const metadata = JSON.parse(resource.metadataJson) as { notebookId?: string }
    return typeof metadata.notebookId === 'string' ? metadata.notebookId : undefined
  } catch {
    return undefined
  }
}
