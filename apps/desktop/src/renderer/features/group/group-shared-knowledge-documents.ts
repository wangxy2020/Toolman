import { IpcChannel } from '@toolman/shared'
import type { KnowledgeFilePanelItem } from '../knowledge/KnowledgeBaseFilePanel'

export interface SharedKnowledgeDocMeta {
  id: string
  title: string
  contentHash?: string | null
  sizeBytes?: number | null
  mimeType?: string | null
  updatedAt: number
}

export function buildSharedKnowledgeDocMetaFromEvents(
  events: Array<{
    eventType: string
    timestamp: number
    payload?: Record<string, unknown>
  }>,
  sourceKbId: string,
): Map<string, SharedKnowledgeDocMeta> {
  const meta = new Map<string, SharedKnowledgeDocMeta>()

  for (const event of events) {
    const kbId = event.payload?.kb_id
    if (kbId !== sourceKbId) continue

    if (event.eventType === 'Shared' || event.eventType === 'Created') {
      const documentIds = event.payload?.document_ids
      if (Array.isArray(documentIds)) {
        for (const docId of documentIds) {
          if (typeof docId !== 'string' || docId.length === 0) continue
          if (!meta.has(docId)) {
            meta.set(docId, {
              id: docId,
              title: '共享文档',
              updatedAt: event.timestamp,
            })
          }
        }
      }
      continue
    }

    if (event.eventType !== 'Updated') continue

    const docId = event.payload?.doc_id
    if (typeof docId !== 'string') continue

    const contentHash = event.payload?.content_hash
    if (typeof contentHash !== 'string' || contentHash.length === 0) {
      continue
    }

    const previous = meta.get(docId)
    const title =
      typeof event.payload?.title === 'string'
        ? event.payload.title
        : (previous?.title ?? '文档')
    const sizeBytes =
      typeof event.payload?.size_bytes === 'number' ? event.payload.size_bytes : null
    const mimeType =
      typeof event.payload?.mime_type === 'string' ? event.payload.mime_type : null

    meta.set(docId, {
      id: docId,
      title,
      contentHash,
      sizeBytes,
      mimeType,
      updatedAt: event.timestamp,
    })
  }

  return meta
}

const UUID_DOCUMENT_TITLE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\.[^./\\]+)?$/i

function isUuidDerivedDocumentTitle(title: string): boolean {
  return UUID_DOCUMENT_TITLE.test(title.trim())
}

function preferSharedKnowledgeDocumentTitle(
  localTitle: string,
  eventTitle: string | undefined,
): string {
  if (!eventTitle || eventTitle === '共享文档' || eventTitle === '文档') {
    return localTitle
  }
  if (isUuidDerivedDocumentTitle(localTitle)) {
    return eventTitle
  }
  return localTitle
}

export function mergeSharedKnowledgePanelDocuments(
  localItems: KnowledgeFilePanelItem[],
  sharedDocIds: string[] | undefined,
  eventMeta: Map<string, SharedKnowledgeDocMeta>,
): KnowledgeFilePanelItem[] {
  const localById = new Map(localItems.map((item) => [item.id, item]))
  const orderedIds =
    sharedDocIds && sharedDocIds.length > 0
      ? sharedDocIds
      : [...new Set([...localById.keys(), ...eventMeta.keys()])].sort((leftId, rightId) => {
          const leftTitle =
            localById.get(leftId)?.title ?? eventMeta.get(leftId)?.title ?? leftId
          const rightTitle =
            localById.get(rightId)?.title ?? eventMeta.get(rightId)?.title ?? rightId
          return leftTitle.localeCompare(rightTitle, 'zh-CN', { sensitivity: 'base' })
        })

  if (orderedIds.length === 0) {
    return []
  }

  return orderedIds.map((id) => {
    const local = localById.get(id)
    const remote = eventMeta.get(id)

    if (local) {
      const title = preferSharedKnowledgeDocumentTitle(local.title, remote?.title)
      return title === local.title ? local : { ...local, title }
    }

    if (!remote) {
      return {
        id,
        title: '共享文档',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        status: 'pending' as const,
        absolutePath: null,
        sourceKind: 'file' as const,
      }
    }

    return {
      id: remote.id,
      title: remote.title,
      createdAt: remote.updatedAt,
      updatedAt: remote.updatedAt,
      sizeBytes: remote.sizeBytes,
      mimeType: remote.mimeType,
      status: 'pending' as const,
      absolutePath: null,
      sourceKind: 'file' as const,
    }
  })
}

export async function loadAllP2pKnowledgeEvents(
  p2pWorkspaceId: string,
): Promise<
  Array<{
    eventType: string
    timestamp: number
    payload?: Record<string, unknown>
  }>
> {
  const allEvents: Array<{
    eventType: string
    timestamp: number
    payload?: Record<string, unknown>
  }> = []
  let offset = 0

  while (true) {
    const result = await window.api.invoke(IpcChannel.P2pEventList, {
      workspaceId: p2pWorkspaceId,
      resourceType: 'Knowledge',
      limit: 200,
      offset,
    })
    if (!result.ok) {
      throw new Error(result.error.message)
    }

    const data = result.data as {
      events: Array<{
        eventType: string
        timestamp: number
        payload?: Record<string, unknown>
      }>
      hasMore: boolean
    }
    allEvents.push(...data.events)
    if (!data.hasMore || data.events.length === 0) {
      break
    }
    offset += data.events.length
  }

  // P2pEventList returns newest-first pages; reverse so metadata merges keep latest values.
  return allEvents.reverse()
}
