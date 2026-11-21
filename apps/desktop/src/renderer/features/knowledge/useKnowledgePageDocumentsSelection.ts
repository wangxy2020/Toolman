import { useEffect, useMemo, useState } from 'react'
import type { KnowledgeFileSortField } from './knowledge-file-sort'
import {
  resolveKnowledgeFilesForChat,
  resolveKnowledgeFilesForTranslation,
} from './knowledge-chat-files'
import type { KnowledgePageProps } from './knowledge-page-types'
import type { UseKnowledgePageStateResult } from './useKnowledgePageState'
import type { useKnowledgePageDocumentsList } from './useKnowledgePageDocumentsList'

type DocumentsListResult = ReturnType<typeof useKnowledgePageDocumentsList>

export function useKnowledgePageDocumentsSelection(
  {
    section,
    onChatWithKnowledgeFiles,
    onTranslateWithKnowledgeFiles,
  }: Pick<
    KnowledgePageProps,
    'section' | 'onChatWithKnowledgeFiles' | 'onTranslateWithKnowledgeFiles'
  >,
  state: Pick<
    UseKnowledgePageStateResult,
    | 't'
    | 'activeId'
    | 'sortField'
    | 'setSortField'
    | 'setSortAscending'
    | 'importTarget'
    | 'showFileToolbar'
    | 'embedSettingsKb'
  >,
  list: Pick<DocumentsListResult, 'documents' | 'panelDocuments'>,
) {
  const {
    t,
    activeId,
    sortField,
    setSortField,
    setSortAscending,
    importTarget,
    showFileToolbar,
    embedSettingsKb,
  } = state
  const { documents, panelDocuments } = list

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)

  const chatAttachableFiles = useMemo(
    () => resolveKnowledgeFilesForChat(panelDocuments, selectedIds),
    [panelDocuments, selectedIds],
  )

  const translateOpenableFiles = useMemo(
    () => resolveKnowledgeFilesForTranslation(panelDocuments, selectedIds),
    [panelDocuments, selectedIds],
  )

  useEffect(() => {
    setSelectedIds(new Set())
  }, [importTarget.kbId, activeId, section])

  useEffect(() => {
    const validIds = new Set(panelDocuments.map((item) => item.id))
    setSelectedIds((current) => {
      const next = new Set(Array.from(current).filter((id) => validIds.has(id)))
      return next.size === current.size ? current : next
    })
  }, [panelDocuments])

  const handleChatWithFiles = () => {
    if (selectedIds.size === 0) {
      documents.setError(t('knowledgePage.toolbar.chatWithFiles'))
      return
    }
    const items = chatAttachableFiles
    if (items.length === 0) {
      documents.setError('所选文件无法带到聊天（仅支持有本地路径的文件）')
      return
    }
    // Pass embedSettingsKb (not raw `active`) so default-folder virtual IDs still carry analysisModelId.
    onChatWithKnowledgeFiles?.(items, embedSettingsKb)
  }

  const handleTranslateWithFiles = () => {
    if (selectedIds.size === 0) {
      documents.setError(t('knowledgePage.toolbar.translateWithFiles'))
      return
    }
    const items = translateOpenableFiles
    if (items.length === 0) {
      documents.setError('所选文件无法带到翻译（仅支持 PDF / Word / Excel）')
      return
    }
    onTranslateWithKnowledgeFiles?.(items, embedSettingsKb)
  }

  const handleToggleSelect = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSelectAll = () => {
    setSelectedIds(new Set(panelDocuments.map((item) => item.id)))
  }

  const handleClearSelection = () => {
    setSelectedIds(new Set())
  }

  const handleSortFieldChange = (field: KnowledgeFileSortField) => {
    if (field === sortField) {
      setSortAscending((current) => !current)
      return
    }
    setSortField(field)
    setSortAscending(field === 'name')
  }

  const handleContextMenu = (event: React.MouseEvent, _documentId?: string) => {
    if (!showFileToolbar) return
    event.preventDefault()
    // Right-click opens the menu only — do not change row selection.
    setContextMenu({ x: event.clientX, y: event.clientY })
  }

  return {
    selectedIds,
    setSelectedIds,
    contextMenu,
    setContextMenu,
    chatAttachableFiles,
    translateOpenableFiles,
    handleChatWithFiles,
    handleTranslateWithFiles,
    handleToggleSelect,
    handleSelectAll,
    handleClearSelection,
    handleSortFieldChange,
    handleContextMenu,
  }
}
