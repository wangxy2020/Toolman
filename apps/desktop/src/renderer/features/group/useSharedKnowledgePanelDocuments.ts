import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  IpcChannel,
  findGroupSavedKnowledgeBaseId,
  isP2pSharedKnowledgeMirrorDescription,
  type KnowledgeBase,
  type Workspace,
} from '@toolman/shared'
import {
  knowledgeDocumentToPanelItem,
} from '../knowledge/KnowledgeBaseFilePanel'
import type { GroupKnowledgePanelItem } from './group-knowledge-panel-item'
import {
  sortKnowledgeFilePanelItems,
  type KnowledgeFileSortField,
} from '../knowledge/knowledge-file-sort'
import { useKnowledgeDocuments } from '../knowledge/useKnowledgeDocuments'
import { getPathBasename } from '../knowledge/knowledge-path-utils'
import { useDebouncedCallback } from '../../utils/debounce'
import { GROUP_P2P_UI_TIMING } from './group-p2p-ui-timing'
import { subscribeKnowledgeDocumentContentEvents } from './group-p2p-sync-policy'
import {
  buildSharedKnowledgeDocMetaFromEvents,
  loadAllP2pKnowledgeEvents,
  mergeSharedKnowledgePanelDocuments,
  type SharedKnowledgeDocMeta,
} from './group-shared-knowledge-documents'

interface SavedDocumentOverride {
  savedDocumentId: string
  absolutePath: string
}

interface Options {
  p2pWorkspaceId: string
  workspaceName: string
  sharedFolderName: string
  kbId: string
  sharedDocumentIds?: string[]
  isResourceOwner?: boolean
  sortField?: KnowledgeFileSortField
  savedDocumentOverrides?: Record<string, SavedDocumentOverride>
}

function resolveSavedGroupKnowledgeBaseId(
  knowledgeBases: KnowledgeBase[],
  workspaceName: string,
  p2pWorkspaceId: string,
  sharedFolderName?: string,
): string | null {
  return findGroupSavedKnowledgeBaseId(
    knowledgeBases.map((kb) => ({
      id: kb.id,
      kind: kb.kind,
      name: kb.name,
      description: kb.description ?? null,
    })),
    {
      p2pWorkspaceId,
      groupName: workspaceName,
      sharedFolderName,
    },
    { isMirrorDescription: isP2pSharedKnowledgeMirrorDescription },
  )
}

export function useSharedKnowledgePanelDocuments({
  p2pWorkspaceId,
  workspaceName,
  sharedFolderName: _sharedFolderName,
  kbId,
  sharedDocumentIds,
  isResourceOwner = false,
  sortField = 'createdAt',
  savedDocumentOverrides,
}: Options) {
  const [localWorkspaceId, setLocalWorkspaceId] = useState<string | null>(null)
  const [savedGroupKbId, setSavedGroupKbId] = useState<string | null>(null)
  const sourceKbId = kbId
  const sourceDocuments = useKnowledgeDocuments(
    isResourceOwner ? localWorkspaceId : null,
    isResourceOwner ? sourceKbId : null,
  )
  const [eventsLoading, setEventsLoading] = useState(false)
  const [eventMeta, setEventMeta] = useState<Map<string, SharedKnowledgeDocMeta>>(() => new Map())
  const hasEventMetaRef = useRef(false)
  const savedDocuments = useKnowledgeDocuments(localWorkspaceId, savedGroupKbId)

  useEffect(() => {
    void window.api.invoke(IpcChannel.WorkspaceGetDefault).then((result) => {
      if (result.ok) {
        setLocalWorkspaceId((result.data as Workspace).id)
      }
    })
  }, [])

  const loadSavedGroupKbId = useCallback(async () => {
    if (!localWorkspaceId) return

    const result = await window.api.invoke(IpcChannel.KnowledgeBaseList, {
      workspaceId: localWorkspaceId,
    })
    if (!result.ok) return

    const data = result.data as { items: KnowledgeBase[] }
    setSavedGroupKbId(
      resolveSavedGroupKnowledgeBaseId(
        data.items,
        workspaceName,
        p2pWorkspaceId,
      ),
    )
  }, [localWorkspaceId, p2pWorkspaceId, workspaceName])

  useEffect(() => {
    void loadSavedGroupKbId()
  }, [loadSavedGroupKbId])

  const loadEventMeta = useCallback(async () => {
    const showLoading = !hasEventMetaRef.current
    if (showLoading) {
      setEventsLoading(true)
    }

    try {
      const events = await loadAllP2pKnowledgeEvents(p2pWorkspaceId)
      const nextMeta = buildSharedKnowledgeDocMetaFromEvents(events, sourceKbId)
      hasEventMetaRef.current = nextMeta.size > 0
      setEventMeta(nextMeta)
    } catch {
      if (!hasEventMetaRef.current) {
        setEventMeta(new Map())
      }
    } finally {
      if (showLoading) {
        setEventsLoading(false)
      }
    }
  }, [p2pWorkspaceId, sourceKbId])

  const refresh = useCallback(async () => {
    await Promise.all([
      loadEventMeta(),
      loadSavedGroupKbId(),
      savedDocuments.load(),
      ...(isResourceOwner ? [sourceDocuments.load()] : []),
    ])
  }, [isResourceOwner, loadEventMeta, loadSavedGroupKbId, savedDocuments.load, sourceDocuments.load])

  const debouncedRefresh = useDebouncedCallback(refresh, GROUP_P2P_UI_TIMING.dataRefreshDebounceMs)

  useEffect(() => {
    if (!localWorkspaceId) return
    void refresh()
  }, [localWorkspaceId, sourceKbId, refresh])

  useEffect(() => {
    if (!localWorkspaceId) return
    return subscribeKnowledgeDocumentContentEvents(p2pWorkspaceId, sourceKbId, debouncedRefresh)
  }, [debouncedRefresh, localWorkspaceId, p2pWorkspaceId, sourceKbId])

  const savedDocsByLookupKey = useMemo(() => {
    const byTitle = new Map<string, GroupKnowledgePanelItem>()
    const byContentHash = new Map<string, GroupKnowledgePanelItem>()
    const addTitleKey = (key: string, item: GroupKnowledgePanelItem) => {
      const normalized = key.trim().toLowerCase()
      if (!normalized || byTitle.has(normalized)) return
      byTitle.set(normalized, item)
    }

    for (const doc of savedDocuments.items) {
      const item = {
        ...knowledgeDocumentToPanelItem(doc),
        savedDocumentId: doc.id,
      }
      addTitleKey(doc.title, item)
      if (doc.absolutePath) {
        addTitleKey(getPathBasename(doc.absolutePath), item)
      }
      if (doc.contentHash) {
        byContentHash.set(doc.contentHash, item)
      }
    }
    return { byTitle, byContentHash }
  }, [savedDocuments.items])

  const resolveSavedPanelItem = useCallback(
    (doc: GroupKnowledgePanelItem): GroupKnowledgePanelItem | undefined => {
      const override = savedDocumentOverrides?.[doc.id]
      if (override) {
        return {
          ...doc,
          status: 'ready',
          absolutePath: override.absolutePath,
          savedDocumentId: override.savedDocumentId,
        }
      }

      const remoteMeta = eventMeta.get(doc.id)
      if (remoteMeta?.contentHash) {
        const byHash = savedDocsByLookupKey.byContentHash.get(remoteMeta.contentHash)
        if (byHash) return byHash
      }

      return (
        savedDocsByLookupKey.byTitle.get(doc.title.trim().toLowerCase()) ??
        (doc.absolutePath
          ? savedDocsByLookupKey.byTitle.get(getPathBasename(doc.absolutePath).trim().toLowerCase())
          : undefined)
      )
    },
    [eventMeta, savedDocumentOverrides, savedDocsByLookupKey],
  )

  const panelDocuments = useMemo((): GroupKnowledgePanelItem[] => {
    const localItems = isResourceOwner
      ? sourceDocuments.items.map(knowledgeDocumentToPanelItem)
      : []
    const merged = mergeSharedKnowledgePanelDocuments(localItems, sharedDocumentIds, eventMeta)
    const enriched = merged.map((doc) => {
      if (isResourceOwner) {
        return doc
      }
      const saved = resolveSavedPanelItem(doc)
      if (!saved) {
        return {
          ...doc,
          status: doc.status ?? ('pending' as const),
          absolutePath: null,
          savedDocumentId: null,
        }
      }
      return {
        ...doc,
        status: 'ready' as const,
        absolutePath: saved.absolutePath,
        sizeBytes: saved.sizeBytes ?? doc.sizeBytes,
        mimeType: saved.mimeType ?? doc.mimeType,
        savedDocumentId: saved.savedDocumentId ?? null,
      }
    })

    if (sharedDocumentIds && sharedDocumentIds.length > 0) {
      return enriched
    }

    return sortKnowledgeFilePanelItems(enriched, sortField, false)
  }, [
    eventMeta,
    isResourceOwner,
    resolveSavedPanelItem,
    sharedDocumentIds,
    sortField,
    sourceDocuments.items,
  ])

  const loading = Boolean(
    (eventsLoading || (isResourceOwner && sourceDocuments.loading)) &&
      panelDocuments.length === 0,
  )

  return {
    localWorkspaceId,
    sourceKbId,
    savedGroupKbId,
    panelDocuments,
    loading,
    refresh,
  }
}
