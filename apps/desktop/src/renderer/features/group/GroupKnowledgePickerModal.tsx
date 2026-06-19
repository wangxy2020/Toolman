import { useCallback, useMemo, useState } from 'react'
import { IpcChannel, type KnowledgeBase, type KnowledgeDocument, type P2pSharedResource } from '@toolman/shared'
import {
  formatKnowledgeFileSize,
  getKnowledgeDocStatusLabel,
} from '../knowledge/knowledge-file-display'
import type { GroupPickerGroup, GroupPickerSelection } from './group-resource-picker-types'
import { GroupResourcePickerModal } from './GroupResourcePickerModal'

/** `undefined` = not shared; `null` = whole knowledge base shared; `string[]` = partially shared document ids */
type SharedDocumentState = string[] | null | undefined

function buildSharedDocumentMap(
  sharedResources: P2pSharedResource[],
): Map<string, SharedDocumentState> {
  const map = new Map<string, SharedDocumentState>()
  for (const resource of sharedResources) {
    if (resource.resourceType !== 'Knowledge') continue
    const kbId = resource.localResourceId ?? resource.id
    map.set(kbId, resource.sharedDocumentIds ?? null)
  }
  return map
}

interface Props {
  knowledgeBases: KnowledgeBase[]
  sharedResources: P2pSharedResource[]
  sourceWorkspaceId: string | null
  onClose: () => void
  onConfirm: (
    selections: Array<{ knowledgeBaseId: string; documentIds?: string[] }>,
  ) => Promise<void>
}

export function GroupKnowledgePickerModal({
  knowledgeBases,
  sharedResources,
  sourceWorkspaceId,
  onClose,
  onConfirm,
}: Props) {
  const [loadedDocs, setLoadedDocs] = useState<Record<string, GroupPickerGroup['items']>>({})
  const [loadingGroupId, setLoadingGroupId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const sharedDocumentMap = useMemo(
    () => buildSharedDocumentMap(sharedResources),
    [sharedResources],
  )

  const availableBases = useMemo(
    () =>
      knowledgeBases.filter((item) => {
        const shared = sharedDocumentMap.get(item.id)
        if (shared === undefined) return true
        if (shared === null) return false
        return item.documentCount > shared.length
      }),
    [knowledgeBases, sharedDocumentMap],
  )

  const groups = useMemo<GroupPickerGroup[]>(
    () =>
      availableBases
        .map((kb) => {
          const sharedDocIds = sharedDocumentMap.get(kb.id)
          const loadedItems = loadedDocs[kb.id]
          const visibleItems = loadedItems ?? []
          const remainingCount =
            loadedItems != null
              ? visibleItems.length
              : sharedDocIds && sharedDocIds.length > 0
                ? Math.max(kb.documentCount - sharedDocIds.length, 0)
                : kb.documentCount

          return {
            id: kb.id,
            name: kb.name,
            description: `${remainingCount} 篇可添加文档${
              kb.description?.trim() ? ` · ${kb.description.trim()}` : ''
            }`,
            groupSelectable: loadedItems == null && kb.documentCount > 0,
            items: visibleItems,
          }
        })
        .filter((group): group is GroupPickerGroup => group != null),
    [availableBases, loadedDocs, sharedDocumentMap],
  )

  const loadDocuments = useCallback(
    async (knowledgeBaseId: string) => {
      if (!sourceWorkspaceId || Object.hasOwn(loadedDocs, knowledgeBaseId)) return

      setLoadingGroupId(knowledgeBaseId)
      setLoadError(null)
      try {
        const result = await window.api.invoke(IpcChannel.KnowledgeDocumentList, {
          workspaceId: sourceWorkspaceId,
          kbId: knowledgeBaseId,
        })

        if (!result.ok) {
          throw new Error(result.error.message)
        }

        const data = result.data as { items: KnowledgeDocument[] }
        const sharedDocIds = sharedDocumentMap.get(knowledgeBaseId)

        const items = data.items
          .filter((doc) => !sharedDocIds || !sharedDocIds.includes(doc.id))
          .map((doc) => ({
            id: doc.id,
            name: doc.title,
            meta: [
              doc.sizeBytes != null ? formatKnowledgeFileSize(doc.sizeBytes) : null,
              doc.status === 'ready' ? null : getKnowledgeDocStatusLabel(doc.status),
            ]
              .filter(Boolean)
              .join(' · '),
            disabled: doc.status !== 'ready',
          }))

        setLoadedDocs((current) => ({
          ...current,
          [knowledgeBaseId]: items,
        }))
      } catch (error) {
        const message = error instanceof Error ? error.message : '加载文档失败'
        setLoadError(message)
        setLoadedDocs((current) => ({
          ...current,
          [knowledgeBaseId]: [],
        }))
      } finally {
        setLoadingGroupId(null)
      }
    },
    [loadedDocs, sharedDocumentMap, sourceWorkspaceId],
  )

  const handleConfirm = useCallback(
    async (selection: GroupPickerSelection[]) => {
      const payload = selection.flatMap(({ groupId, itemIds }) => {
        if (itemIds.length === 0) {
          return [{ knowledgeBaseId: groupId, documentIds: undefined }]
        }

        const allReadyDocs = loadedDocs[groupId]?.filter((item) => !item.disabled) ?? []
        const selectedIds =
          allReadyDocs.length > 0
            ? itemIds.filter((id) => allReadyDocs.some((doc) => doc.id === id))
            : itemIds

        if (selectedIds.length === 0) {
          return []
        }

        return [{ knowledgeBaseId: groupId, documentIds: selectedIds }]
      })

      if (payload.length === 0) {
        throw new Error('没有可添加的文档，请勾选已就绪的文件或整个知识库')
      }

      await onConfirm(payload)
    },
    [loadedDocs, onConfirm],
  )

  return (
    <GroupResourcePickerModal
      title="选择知识库"
      hint="展开知识库可查看未共享文档，勾选知识库将全选可添加文件，也可单独勾选文档。"
      confirmLabel="添加"
      groups={groups}
      loadingGroupId={loadingGroupId}
      error={loadError}
      onClose={onClose}
      onConfirm={handleConfirm}
      onGroupExpand={(groupId) => void loadDocuments(groupId)}
    />
  )
}
