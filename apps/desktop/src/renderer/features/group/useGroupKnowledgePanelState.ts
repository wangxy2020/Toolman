import { useCallback, useMemo, useState } from 'react'
import type { P2pSharedResource } from '@toolman/shared'
import { useRegisterGroupPanelError } from './group-page-status'
import type { GroupKnowledgeSavedDocumentRegistry } from './GroupSharedKnowledgeSection'
import { resolveGroupKnowledgeResourceLabel } from './group-knowledge-display'
import { groupResourcesByMember } from './group-shared-resources-by-member'
import { hasShareableKnowledgeBases } from './group-knowledge-picker-utils'
import { createGroupPanelRefreshHandler } from './group-p2p-sync-policy'
import { useP2pKnowledge } from './useP2pKnowledge'
import { useI18n } from '../../i18n/useI18n'
import type { GroupKnowledgePanelProps, PendingDelete } from './group-knowledge-panel-types'
import {
  canDeleteAnySelectedKey,
  canDeleteGroupKnowledgeResource,
  collectAllSectionKeys,
  toggleSectionSelection,
  toggleSelectionKey,
  updateSavedDocRegistry,
} from './group-knowledge-panel-utils'

export function useGroupKnowledgePanelState({
  p2pWorkspaceId,
  workspaceName,
  sourceWorkspaceId,
  knowledgeBases,
  canManageGroupResources,
  canWriteWorkspace,
  members,
  selfMemberId,
}: GroupKnowledgePanelProps) {
  const { t } = useI18n()
  const [showPicker, setShowPicker] = useState(false)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [removingKbId, setRemovingKbId] = useState<string | null>(null)
  const [removingDocumentId, setRemovingDocumentId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [sectionKeysMap, setSectionKeysMap] = useState<Record<string, string[]>>({})
  const [savedDocRegistry, setSavedDocRegistry] = useState<
    Record<string, GroupKnowledgeSavedDocumentRegistry>
  >({})
  const [savedDocumentOverrides, setSavedDocumentOverrides] = useState<
    Record<string, Record<string, { savedDocumentId: string; absolutePath: string }>>
  >({})
  const p2pKnowledge = useP2pKnowledge({ workspaceId: p2pWorkspaceId })

  const resolveResourceLabel = useCallback(
    (resource: P2pSharedResource) =>
      resolveGroupKnowledgeResourceLabel(resource, knowledgeBases, t),
    [knowledgeBases, t],
  )

  useRegisterGroupPanelError('knowledge', p2pKnowledge.error, () => p2pKnowledge.setError(null))

  const handleRefresh = useMemo(
    () => createGroupPanelRefreshHandler(p2pWorkspaceId, () => p2pKnowledge.load()),
    [p2pKnowledge.load, p2pWorkspaceId],
  )

  const hasShareableKnowledge = useMemo(
    () => hasShareableKnowledgeBases(knowledgeBases, p2pKnowledge.sharedResources),
    [knowledgeBases, p2pKnowledge.sharedResources],
  )

  const memberSections = useMemo(
    () =>
      groupResourcesByMember(
        p2pKnowledge.sharedResources,
        members,
        selfMemberId,
        t('groupPage.panels.unknownMember'),
      ),
    [members, p2pKnowledge.sharedResources, selfMemberId, t],
  )

  const canDeleteResource = useCallback(
    (resource: { sharedBy: string }) =>
      canDeleteGroupKnowledgeResource(
        resource,
        canWriteWorkspace,
        canManageGroupResources,
        selfMemberId,
      ),
    [canManageGroupResources, canWriteWorkspace, selfMemberId],
  )

  const handleToggleSelect = useCallback((selectionKey: string) => {
    setSelectedKeys((current) => toggleSelectionKey(current, selectionKey))
  }, [])

  const handleToggleSelectSection = useCallback((selectionKeys: string[]) => {
    setSelectedKeys((current) => toggleSectionSelection(current, selectionKeys))
  }, [])

  const handleSavedDocumentRegistryChange = useCallback(
    (resourceId: string, registry: GroupKnowledgeSavedDocumentRegistry | null) => {
      setSavedDocRegistry((current) => updateSavedDocRegistry(current, resourceId, registry))
    },
    [],
  )

  const canDeleteSelected = useMemo(
    () =>
      canDeleteAnySelectedKey(
        selectedKeys,
        p2pKnowledge.sharedResources,
        canDeleteResource,
        savedDocRegistry,
      ),
    [canDeleteResource, p2pKnowledge.sharedResources, savedDocRegistry, selectedKeys],
  )

  const handleSectionKeysChange = useCallback((resourceId: string, keys: string[]) => {
    setSectionKeysMap((current) => ({ ...current, [resourceId]: keys }))
  }, [])

  const handleSelectAll = useCallback(() => {
    setSelectedKeys(collectAllSectionKeys(sectionKeysMap))
  }, [sectionKeysMap])

  const handleClearSelection = useCallback(() => {
    setSelectedKeys(new Set())
  }, [])

  const deleteSelectedLabel = useMemo(() => {
    const hasGroupDelete = p2pKnowledge.sharedResources.some((resource) =>
      canDeleteResource(resource),
    )
    return hasGroupDelete
      ? t('groupPage.fileContextMenu.deleteSelected')
      : t('groupPage.fileContextMenu.deleteSaved')
  }, [canDeleteResource, p2pKnowledge.sharedResources, t])

  const handleContextMenu = useCallback(
    (event: React.MouseEvent) => {
      if (!canWriteWorkspace) return
      event.preventDefault()
      setContextMenu({ x: event.clientX, y: event.clientY })
    },
    [canWriteWorkspace],
  )

  return {
    t,
    workspaceName,
    p2pWorkspaceId,
    sourceWorkspaceId,
    selfMemberId,
    canWriteWorkspace,
    p2pKnowledge,
    showPicker,
    setShowPicker,
    selectedKeys,
    setSelectedKeys,
    removingKbId,
    setRemovingKbId,
    removingDocumentId,
    setRemovingDocumentId,
    pendingDelete,
    setPendingDelete,
    contextMenu,
    setContextMenu,
    sectionKeysMap,
    savedDocRegistry,
    savedDocumentOverrides,
    setSavedDocumentOverrides,
    handleRefresh,
    hasShareableKnowledge,
    memberSections,
    canDeleteResource,
    handleToggleSelect,
    handleToggleSelectSection,
    handleSavedDocumentRegistryChange,
    canDeleteSelected,
    handleSectionKeysChange,
    handleSelectAll,
    handleClearSelection,
    deleteSelectedLabel,
    handleContextMenu,
    resolveResourceLabel,
  }
}

export type UseGroupKnowledgePanelStateResult = ReturnType<typeof useGroupKnowledgePanelState>
