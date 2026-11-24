import { useCallback, useMemo, useState } from 'react'
import {
  IpcChannel,
  type KnowledgeBase,
  type KnowledgeDocument,
} from '@toolman/shared'
import { useI18n } from '../../i18n/useI18n'
import {
  formatKnowledgeFileSize,
  getKnowledgeDocStatusLabel,
} from '../knowledge/knowledge-file-display'
import { buildStoragePathForKb } from '../knowledge/knowledge-import-paths'
import { filterAgentBindableKnowledgeBases } from '../knowledge/agent-knowledge-bind'
import { GroupResourcePickerModal } from '../group/GroupResourcePickerModal'
import type { GroupPickerGroup, GroupPickerSelection } from '../group/group-resource-picker-types'
import { buildClassroomKbPickerGroups } from './assistant-lib-kb-picker-groups'

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

  const groups = useMemo(
    () =>
      buildClassroomKbPickerGroups({
        knowledgeBases: availableBases,
        loadedDocs,
        docCountLabel: (count) => t('assistantLibPage.pickLocalKbDocCount', { count }),
        sectionCountLabel: (count) =>
          t('assistantLibPage.pickLocalKbSectionCount', { count }),
        t,
      }),
    [availableBases, loadedDocs, t],
  )

  const loadDocuments = useCallback(
    async (knowledgeBaseId: string) => {
      if (knowledgeBaseId.startsWith('section:')) return
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
