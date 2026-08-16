import type { ShareProjection, ShareProjectionEvent, SharedProjectionItem, SharedProjectionKind } from './share-projection-types.js'
import {
  notePermission,
  readNumber,
  readPermission,
  readSessionPermission,
  readString,
  readStringArray,
  readStringRecord,
} from './share-projection-parse.js'

export function projectKnowledge(
  event: ShareProjectionEvent,
  payload: Record<string, unknown>,
): ShareProjection[] {
  const kbId = readString(payload, 'kb_id') ?? event.resourceId
  if (event.eventType === 'Deleted') {
    return [{ action: 'remove', kind: 'knowledge', id: kbId, cascadeChildren: true }]
  }
  if (event.eventType === 'Updated') {
    const docId = readString(payload, 'doc_id') ?? event.resourceId
    const title = readString(payload, 'title') ?? '文档'
    const contentHash = readString(payload, 'content_hash')
    const mimeType = readString(payload, 'mime_type')
    const sizeBytes = readNumber(payload, 'size_bytes')
    const item: SharedProjectionItem = {
      id: docId,
      name: title,
      kind: 'knowledge',
      parentId: kbId,
      addedAt: event.timestamp,
      contentHash,
      mimeType,
    }
    return [
      {
        action: 'upsert',
        item,
        knowledgeBlob: contentHash
          ? { contentHash, title, mimeType, sizeBytes }
          : undefined,
      },
    ]
  }
  if (event.eventType !== 'Shared' && event.eventType !== 'Created') return []
  return [
    {
      action: 'upsert',
      item: {
        id: kbId,
        name: readString(payload, 'name') ?? '共享知识库',
        kind: 'knowledge',
        addedAt: event.timestamp,
        preview: readString(payload, 'description'),
      },
    },
  ]
}

export function projectNote(
  event: ShareProjectionEvent,
  payload: Record<string, unknown>,
): ShareProjection[] {
  const noteId = readString(payload, 'note_id') ?? event.resourceId
  if (event.eventType === 'Deleted') {
    return [{ action: 'remove', kind: 'notes', id: noteId, cascadeChildren: false }]
  }
  const title = readString(payload, 'title') ?? '共享笔记'
  const permission = readPermission(payload.permission)
  const content = readString(payload, 'content') ?? ''
  const loroOplog = readString(payload, 'loro_oplog')
  const hasBody = Boolean(loroOplog || payload.content != null)
  if (
    event.eventType !== 'Shared' &&
    event.eventType !== 'Created' &&
    event.eventType !== 'Updated'
  ) {
    return []
  }
  return [
    {
      action: 'upsert',
      item: {
        id: noteId,
        name: title,
        kind: 'notes',
        parentId: readString(payload, 'notebook_id'),
        parentName: readString(payload, 'notebook_name'),
        addedAt: event.timestamp,
        permission,
        preview: content ? content.slice(0, 160) : undefined,
      },
      noteBody: hasBody
        ? {
            noteId,
            title,
            content,
            loroOplog,
            permission: notePermission(permission),
          }
        : permission
          ? {
              noteId,
              title,
              permission: notePermission(permission),
            }
          : undefined,
    },
  ]
}

function resolveAgentSessionIds(payload: Record<string, unknown>): {
  sessionIds: string[]
  prune: boolean
} {
  const raw = Object.prototype.hasOwnProperty.call(payload, 'session_ids')
    ? payload.session_ids
    : Object.prototype.hasOwnProperty.call(payload, 'sessionIds')
      ? payload.sessionIds
      : undefined
  if (raw !== undefined) {
    const ids = readStringArray(raw) ?? []
    return { sessionIds: ids, prune: ids.length > 0 }
  }
  const titles = readStringRecord(payload.session_titles ?? payload.sessionTitles)
  const permissions = readStringRecord(payload.session_permissions ?? payload.sessionPermissions)
  const singular = readString(payload, 'session_id') ?? readString(payload, 'sessionId')
  const inferred = [
    ...Object.keys(titles),
    ...Object.keys(permissions),
    ...(singular ? [singular] : []),
  ]
  return { sessionIds: [...new Set(inferred)], prune: false }
}

export function projectAgent(
  event: ShareProjectionEvent,
  payload: Record<string, unknown>,
): ShareProjection[] {
  const assistantId = readString(payload, 'assistant_id') ?? event.resourceId
  if (event.eventType === 'Deleted') {
    return [{ action: 'remove', kind: 'agents', id: assistantId, cascadeChildren: true }]
  }
  if (
    event.eventType !== 'Shared' &&
    event.eventType !== 'Created' &&
    event.eventType !== 'Updated'
  ) {
    return []
  }
  const name = readString(payload, 'name') ?? '共享智能体'
  const parent: SharedProjectionItem = {
    id: assistantId,
    name,
    kind: 'agents',
    addedAt: event.timestamp,
    permission: readPermission(payload.permission),
    preview: readString(payload, 'description'),
    sharedBy: event.operatorId,
    sourceAssistantId: assistantId,
    referencedModelId: readString(payload, 'model_id') ?? readString(payload, 'shared_model_id'),
    ownerDeviceId: event.sourceDeviceId,
  }
  const { sessionIds, prune } = resolveAgentSessionIds(payload)
  const titles = readStringRecord(payload.session_titles ?? payload.sessionTitles)
  const permissions =
    (payload.session_permissions ?? payload.sessionPermissions) &&
    typeof (payload.session_permissions ?? payload.sessionPermissions) === 'object' &&
    !Array.isArray(payload.session_permissions ?? payload.sessionPermissions)
      ? ((payload.session_permissions ?? payload.sessionPermissions) as Record<string, unknown>)
      : {}
  const projections: ShareProjection[] = [
    {
      action: 'upsert',
      item: parent,
      pruneChildrenKeepIds: prune ? sessionIds : undefined,
    },
  ]
  for (const sessionId of sessionIds) {
    projections.push({
      action: 'upsert',
      item: {
        id: sessionId,
        name: titles[sessionId]?.trim() || '未命名话题',
        kind: 'agents',
        parentId: assistantId,
        parentName: name,
        addedAt: event.timestamp,
        sessionPermission: readSessionPermission(permissions[sessionId]),
        sharedBy: event.operatorId,
        sourceAssistantId: assistantId,
        referencedModelId: parent.referencedModelId,
        ownerDeviceId: event.sourceDeviceId,
      },
    })
  }
  return projections
}

export function projectNamedShare(
  event: ShareProjectionEvent,
  payload: Record<string, unknown>,
  kind: SharedProjectionKind,
  idKeys: string[],
  fallbackName: string,
): ShareProjection[] {
  const id =
    idKeys.map((key) => readString(payload, key)).find((value) => value) ?? event.resourceId
  if (event.eventType === 'Deleted') {
    return [{ action: 'remove', kind, id, cascadeChildren: false }]
  }
  if (
    event.eventType !== 'Shared' &&
    event.eventType !== 'Created' &&
    event.eventType !== 'Updated'
  ) {
    return []
  }
  const name = readString(payload, 'name') ?? fallbackName
  const preview =
    kind === 'workflow'
      ? readString(payload, 'engine')
      : readString(payload, 'description')
  return [
    {
      action: 'upsert',
      item: {
        id,
        name,
        kind,
        addedAt: event.timestamp,
        permission: readPermission(payload.permission),
        preview,
      },
    },
  ]
}
