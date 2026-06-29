import { useCallback, useMemo, useState } from 'react'
import type { Assistant, P2pSharedResource } from '@toolman/shared'
import { useRegisterGroupPanelError } from './group-page-status'
import { createGroupPanelRefreshHandler } from './group-p2p-sync-policy'
import { isShareableGroupAgentSource } from './group-agent-utils'
import { groupResourcesByMember } from './group-shared-resources-by-member'
import { useP2pAgents } from './useP2pAgents'
import { useI18n } from '../../i18n/useI18n'
import type {
  GroupAgentsPanelProps,
  PendingAgentDelete,
  SessionActionMenuState,
} from './group-agents-panel-types'
import {
  canDeleteGroupAgentResource,
  getAddAgentsDisabledReason,
  hasShareableGroupAgents,
  resolveGroupAgentResourceAssistant,
  toggleAgentSectionSelection,
  toggleAgentSelection,
} from './group-agents-panel-utils'

export function useGroupAgentsPanelState({
  p2pWorkspaceId,
  workspaceName,
  sourceWorkspaceId,
  assistants,
  canManageGroupResources,
  canWriteWorkspace,
  members,
  selfMemberId,
  onReloadAssistants,
}: GroupAgentsPanelProps) {
  const { t } = useI18n()
  const [showPicker, setShowPicker] = useState(false)
  const [openingPicker, setOpeningPicker] = useState(false)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [removingResourceId, setRemovingResourceId] = useState<string | null>(null)
  const [removingSessionId, setRemovingSessionId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PendingAgentDelete | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [sessionActionMenu, setSessionActionMenu] = useState<SessionActionMenuState | null>(null)
  const [sectionKeysMap, setSectionKeysMap] = useState<Record<string, string[]>>({})

  const p2pAgents = useP2pAgents({
    workspaceId: p2pWorkspaceId,
    onContentActivity: onReloadAssistants,
  })

  useRegisterGroupPanelError('agents', p2pAgents.error, () => p2pAgents.setError(null))

  const handleRefresh = useMemo(
    () => createGroupPanelRefreshHandler(p2pWorkspaceId, () => p2pAgents.load()),
    [p2pAgents.load, p2pWorkspaceId],
  )

  const assistantsById = useMemo(
    () => new Map(assistants.map((item) => [item.id, item])),
    [assistants],
  )

  const shareableAssistants = useMemo(
    () => assistants.filter((assistant) => isShareableGroupAgentSource(assistant)),
    [assistants],
  )

  const resolveResourceAssistant = useCallback(
    (resource: P2pSharedResource): Assistant | null =>
      resolveGroupAgentResourceAssistant(resource, assistantsById, shareableAssistants),
    [assistantsById, shareableAssistants],
  )

  const hasShareableAgents = useMemo(
    () => hasShareableGroupAgents(shareableAssistants, p2pAgents.sharedResources),
    [p2pAgents.sharedResources, shareableAssistants],
  )

  const addAgentsDisabledReason = useMemo(
    () =>
      getAddAgentsDisabledReason(
        p2pAgents.sharing,
        canWriteWorkspace,
        sourceWorkspaceId,
        shareableAssistants.length,
        hasShareableAgents,
      ),
    [
      canWriteWorkspace,
      hasShareableAgents,
      p2pAgents.sharing,
      shareableAssistants.length,
      sourceWorkspaceId,
    ],
  )

  const canDeleteResource = useCallback(
    (resource: { sharedBy: string }) =>
      canDeleteGroupAgentResource(
        resource,
        canWriteWorkspace,
        canManageGroupResources,
        selfMemberId,
      ),
    [canManageGroupResources, canWriteWorkspace, selfMemberId],
  )

  const canManagePermission = useCallback(
    (resource: { sharedBy: string }) =>
      canDeleteGroupAgentResource(
        resource,
        canWriteWorkspace,
        canManageGroupResources,
        selfMemberId,
      ),
    [canManageGroupResources, canWriteWorkspace, selfMemberId],
  )

  const canManageAgents = useMemo(
    () =>
      canWriteWorkspace &&
      (canManageGroupResources ||
        p2pAgents.sharedResources.some((resource) => canDeleteResource(resource))),
    [canDeleteResource, canManageGroupResources, canWriteWorkspace, p2pAgents.sharedResources],
  )

  const memberSections = useMemo(
    () =>
      groupResourcesByMember(
        p2pAgents.sharedResources,
        members,
        selfMemberId,
        t('groupPage.panels.unknownMember'),
      ),
    [members, p2pAgents.sharedResources, selfMemberId, t],
  )

  const handleToggleSelect = useCallback((selectionKey: string) => {
    setSelectedKeys((current) => toggleAgentSelection(current, selectionKey))
  }, [])

  const handleToggleSelectSection = useCallback((selectionKeys: string[]) => {
    setSelectedKeys((current) => toggleAgentSectionSelection(current, selectionKeys))
  }, [])

  const handleSectionKeysChange = useCallback((resourceId: string, keys: string[]) => {
    setSectionKeysMap((current) => ({ ...current, [resourceId]: keys }))
  }, [])

  return {
    t,
    workspaceName,
    p2pWorkspaceId,
    sourceWorkspaceId,
    selfMemberId,
    canWriteWorkspace,
    shareableAssistants,
    p2pAgents,
    showPicker,
    setShowPicker,
    openingPicker,
    setOpeningPicker,
    selectedKeys,
    setSelectedKeys,
    removingResourceId,
    setRemovingResourceId,
    removingSessionId,
    setRemovingSessionId,
    pendingDelete,
    setPendingDelete,
    contextMenu,
    setContextMenu,
    sessionActionMenu,
    setSessionActionMenu,
    sectionKeysMap,
    handleRefresh,
    resolveResourceAssistant,
    hasShareableAgents,
    addAgentsDisabledReason,
    canDeleteResource,
    canManagePermission,
    canManageAgents,
    memberSections,
    handleToggleSelect,
    handleToggleSelectSection,
    handleSectionKeysChange,
  }
}

export type UseGroupAgentsPanelStateResult = ReturnType<typeof useGroupAgentsPanelState>
