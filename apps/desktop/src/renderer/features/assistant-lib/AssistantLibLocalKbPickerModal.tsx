import { useCallback, useMemo, useState } from 'react'
import {
  IpcChannel,
  type KnowledgeBase,
  type KnowledgeDocument,
} from '@toolman/shared'
import { useI18n } from '../../i18n/useI18n'
import { getKnowledgeSidebarSectionLabel } from '../../i18n/knowledge-sidebar-labels'
import type { TranslateFn } from '../../i18n/I18nProvider'
import { translateKnowledgeFolderName } from '../../i18n/system-labels'
import { filterAgentBindableKnowledgeBases } from '../knowledge/agent-knowledge-bind'
import {
  formatKnowledgeFileSize,
  getKnowledgeDocStatusLabel,
} from '../knowledge/knowledge-file-display'
import { buildStoragePathForKb } from '../knowledge/knowledge-import-paths'
import {
  knowledgeSectionForKind,
  SYSTEM_DEFAULT_FOLDER_KB_NAMES,
} from '../knowledge/knowledge-sidebar-types'
import { GroupResourcePickerModal } from '../group/GroupResourcePickerModal'
import type { GroupPickerGroup, GroupPickerSelection } from '../group/group-resource-picker-types'

type Props = {
  workspaceId: string
  knowledgeBases: KnowledgeBase[]
  defaultLocalFolderPath: string | null
  selectedKbId: string | null
  onClose: () => void
  onSelect: (kb: KnowledgeBase, path: string) => void
}

export function resolveTextbookKbDisplayPath(
  kb: KnowledgeBase,
  defaultLocalFolderPath: string | null,
): string {
  if (kb.kind === 'local') {
    return buildStoragePathForKb(defaultLocalFolderPath, kb.name) ?? kb.name
  }
  return kb.name
}

function resolveClassroomKbLabel(kb: KnowledgeBase, t: TranslateFn): string {
  if (SYSTEM_DEFAULT_FOLDER_KB_NAMES.has(kb.name)) {
    const folderName = translateKnowledgeFolderName(kb.name, t)
    return `${getKnowledgeSidebarSectionLabel(knowledgeSectionForKind(kb.kind), t)} · ${folderName}`
  }
  return kb.name
}

export function AssistantLibLocalKbPickerModal({
  workspaceId,
  knowledgeBases,
  defaultLocalFolderPath,
  selectedKbId,
  onClose,
  onSelect,
}: Props) {
  const { t } = useI18n()
  const [loadedDocs, setLoadedDocs] = useState<Record<string, GroupPickerGroup['items']>>({})
  const [loadingKbId, setLoadingKbId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const availableBases = useMemo(
    () => filterAgentBindableKnowledgeBases(knowledgeBases),
    [knowledgeBases],
  )

  const groups = useMemo<GroupPickerGroup[]>(() => {
    return availableBases.map((kb) => {
      const loadedItems = loadedDocs[kb.id]
      const remainingCount = loadedItems != null ? loadedItems.length : kb.documentCount
      return {
        id: kb.id,
        name: resolveClassroomKbLabel(kb, t),
        description: t('assistantLibPage.pickLocalKbDocCount', { count: remainingCount }),
        groupSelectable: loadedItems == null && remainingCount > 0,
        selectableCount: remainingCount,
        items: loadedItems ?? [],
      }
    })
  }, [availableBases, loadedDocs, t])

  const loadDocuments = useCallback(
    async (knowledgeBaseId: string) => {
      if (Object.hasOwn(loadedDocs, knowledgeBaseId)) return

      setLoadingKbId(knowledgeBaseId)
      setLoadError(null)
      try {
        const result = await window.api.invoke(IpcChannel.KnowledgeDocumentList, {
          workspaceId,
          kbId: knowledgeBaseId,
        })
        if (!result.ok) {
          throw new Error(result.error.message)
        }
        const data = result.data as { items: KnowledgeDocument[] }
        const items = data.items.map((doc) => ({
          id: doc.id,
          name: doc.title,
          meta: [
            doc.sizeBytes != null ? formatKnowledgeFileSize(doc.sizeBytes) : null,
            doc.status === 'ready' ? null : getKnowledgeDocStatusLabel(doc.status, t),
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
        const message =
          error instanceof Error ? error.message : t('groupPage.picker.knowledge.loadDocumentsFailed')
        setLoadError(message)
        setLoadedDocs((current) => ({
          ...current,
          [knowledgeBaseId]: [],
        }))
      } finally {
        setLoadingKbId(null)
      }
    },
    [loadedDocs, t, workspaceId],
  )

  const handleConfirm = useCallback(
    async (selection: GroupPickerSelection[]) => {
      const kbId = selection[0]?.groupId
      const kb = availableBases.find((item) => item.id === kbId)
      if (!kb) {
        throw new Error(t('assistantLibPage.selectKbRequired'))
      }
      onSelect(kb, resolveTextbookKbDisplayPath(kb, defaultLocalFolderPath))
    },
    [availableBases, defaultLocalFolderPath, onSelect, t],
  )

  return (
    <div onClick={(event) => event.stopPropagation()}>
      <GroupResourcePickerModal
        title={t('assistantLibPage.pickLocalKbTitle')}
        hint={t('assistantLibPage.pickKbHint')}
        confirmLabel={t('common.confirm')}
        emptyLabel={t('assistantLibPage.pickLocalKbEmpty')}
        groups={groups}
        loadingGroupId={loadingKbId}
        error={loadError}
        initialSelectedGroupIds={selectedKbId ? [selectedKbId] : undefined}
        onClose={onClose}
        onConfirm={handleConfirm}
        onGroupExpand={(groupId) => void loadDocuments(groupId)}
      />
    </div>
  )
}
