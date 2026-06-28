import { useCallback, useMemo, useState } from 'react'
import type { Assistant, P2pMember, P2pSharedResource, Session } from '@toolman/shared'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { GroupAgentPickerModal } from './GroupAgentPickerModal'
import {
  GroupAgentSessionActionMenu,
  type GroupAgentSessionAction,
} from './GroupAgentSessionActionMenu'
import { GroupFileContextMenu } from './GroupFileContextMenu'
import { GroupMemberResourceSection } from './GroupMemberResourceSection'
import { GroupPanelHeader } from './GroupPanelHeader'
import { GroupPanelRefreshButton } from './GroupPanelRefreshButton'
import { GroupSharedAgentSection } from './GroupSharedAgentSection'
import { agentSelectionKey, parseAgentSelectionKey } from './group-agent-selection'
import {
  getAgentSessionPermission,
  isShareableGroupAgentSource,
  resolveGroupAgentPanelTitle,
} from './group-agent-utils'
import type { OpenGroupAgentSessionRequest } from './group-agent-open'
import { groupResourcesByMember } from './group-shared-resources-by-member'
import { useP2pAgents } from './useP2pAgents'
import { useRegisterGroupPanelError } from './group-page-status'
import { createGroupPanelRefreshHandler } from './group-p2p-sync-policy'
import { useI18n } from '../../i18n/useI18n'

interface Props {
  p2pWorkspaceId: string
  workspaceName: string
  sourceWorkspaceId: string | null
  assistants: Assistant[]
  sessions: Session[]
  canManageGroupResources: boolean
  canWriteWorkspace: boolean
  members: P2pMember[]
  selfMemberId: string | null
  onOpenGroupAgentSession?: (request: OpenGroupAgentSessionRequest) => void | Promise<void>
  onReloadAssistants?: () => void | Promise<void>
}

interface PendingDelete {
  kind: 'agent' | 'sessions'
  groups: Array<{ resourceId: string; sessionIds: string[] }>
  message: string
}

export function GroupAgentsPanel({
  p2pWorkspaceId,
  workspaceName,
  sourceWorkspaceId,
  assistants,
  sessions,
  canManageGroupResources,
  canWriteWorkspace,
  members,
  selfMemberId,
  onOpenGroupAgentSession,
  onReloadAssistants,
}: Props) {
  const { t } = useI18n()
  const [showPicker, setShowPicker] = useState(false)
  const [openingPicker, setOpeningPicker] = useState(false)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [removingResourceId, setRemovingResourceId] = useState<string | null>(null)
  const [removingSessionId, setRemovingSessionId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [sessionActionMenu, setSessionActionMenu] = useState<{
    resource: P2pSharedResource
    sessionId: string
    x: number
    y: number
    align: 'bottom-start'
  } | null>(null)
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
    (resource: P2pSharedResource): Assistant | null => {
      const preferredId = resource.localResourceId ?? resource.id
      const direct = assistantsById.get(preferredId) ?? null
      if (direct && isShareableGroupAgentSource(direct)) {
        return direct
      }
      return shareableAssistants.find((item) => item.id === preferredId) ?? null
    },
    [assistantsById, shareableAssistants],
  )

  const hasShareableAgents = useMemo(
    () =>
      shareableAssistants.some((assistant) => {
        const resource = p2pAgents.sharedResources.find(
          (item) => (item.localResourceId ?? item.id) === assistant.id,
        )
        if (!resource) return true
        const sharedSessionIds = resource.sharedSessionIds
        if (!sharedSessionIds || sharedSessionIds.length === 0) {
          return false
        }
        return true
      }),
    [p2pAgents.sharedResources, shareableAssistants],
  )

  const addAgentsDisabledReason = useMemo(() => {
    if (p2pAgents.sharing) return null
    if (!canWriteWorkspace) return 'readonly' as const
    if (!sourceWorkspaceId) return 'workspace' as const
    if (shareableAssistants.length === 0) return 'noAgents' as const
    if (!hasShareableAgents) return 'allShared' as const
    return null
  }, [
    canWriteWorkspace,
    hasShareableAgents,
    p2pAgents.sharing,
    shareableAssistants.length,
    sourceWorkspaceId,
  ])

  const canDeleteResource = useCallback(
    (resource: { sharedBy: string }) =>
      canWriteWorkspace &&
      (canManageGroupResources ||
        (selfMemberId != null && resource.sharedBy === selfMemberId)),
    [canManageGroupResources, canWriteWorkspace, selfMemberId],
  )

  const canManagePermission = useCallback(
    (resource: { sharedBy: string }) =>
      canWriteWorkspace &&
      (canManageGroupResources ||
        (selfMemberId != null && resource.sharedBy === selfMemberId)),
    [canManageGroupResources, canWriteWorkspace, selfMemberId],
  )

  const canManageAgents = useMemo(
    () =>
      canWriteWorkspace &&
      (canManageGroupResources ||
        p2pAgents.sharedResources.some((resource) => canDeleteResource(resource))),
    [canDeleteResource, canManageGroupResources, canWriteWorkspace, p2pAgents.sharedResources],
  )

  const handleAddAgents = useCallback(
    async (selections: Array<{ assistantId: string; sessionIds?: string[] }>) => {
      if (!sourceWorkspaceId) {
        throw new Error('工作区未就绪')
      }

      for (const selection of selections) {
        const ok = await p2pAgents.shareAgent(
          selection.assistantId,
          sourceWorkspaceId,
          selection.sessionIds,
        )
        if (!ok) {
          throw new Error(p2pAgents.error ?? '添加智能体失败')
        }
      }

      await p2pAgents.load()
    },
    [p2pAgents, sourceWorkspaceId],
  )

  const handleToggleSelect = useCallback((selectionKey: string) => {
    setSelectedKeys((current) => {
      const next = new Set(current)
      if (next.has(selectionKey)) next.delete(selectionKey)
      else next.add(selectionKey)
      return next
    })
  }, [])

  const handleToggleSelectSection = useCallback((selectionKeys: string[]) => {
    setSelectedKeys((current) => {
      const allSelected =
        selectionKeys.length > 0 && selectionKeys.every((key) => current.has(key))
      const next = new Set(current)
      if (allSelected) {
        for (const key of selectionKeys) next.delete(key)
      } else {
        for (const key of selectionKeys) next.add(key)
      }
      return next
    })
  }, [])

  const requestRemoveAgent = useCallback(
    (resourceId: string) => {
      const resource = p2pAgents.sharedResources.find((item) => item.id === resourceId)
      if (!resource || !canDeleteResource(resource)) {
        p2pAgents.setError('无权移除该智能体')
        return
      }

      setPendingDelete({
        kind: 'agent',
        groups: [{ resourceId, sessionIds: [] }],
        message: `确定从群组中移除智能体「${resource.name}」吗？`,
      })
    },
    [canDeleteResource, p2pAgents],
  )

  const requestRemoveSessions = useCallback(
    (resourceId: string, sessionIds: string[]) => {
      const resource = p2pAgents.sharedResources.find((item) => item.id === resourceId)
      if (!resource || !canDeleteResource(resource)) {
        p2pAgents.setError('无权移除所选话题')
        return
      }

      const suffix =
        sessionIds.length > 2
          ? ` 等 ${sessionIds.length} 个话题`
          : sessionIds.length > 1
            ? ''
            : ''
      const preview =
        sessionIds.length > 2
          ? `${sessionIds.length} 个话题`
          : `${sessionIds.length} 个共享话题`

      setPendingDelete({
        kind: 'sessions',
        groups: [{ resourceId, sessionIds }],
        message: `确定从群组智能体「${resource.name}」中移除${preview}${suffix}吗？`,
      })
    },
    [canDeleteResource, p2pAgents],
  )

  const handleRemoveSession = useCallback(
    (resourceId: string, sessionId: string) => {
      requestRemoveSessions(resourceId, [sessionId])
    },
    [requestRemoveSessions],
  )

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return

    const current = pendingDelete
    setPendingDelete(null)

    if (current.kind === 'agent') {
      const resourceId = current.groups[0]?.resourceId
      if (!resourceId) return

      setRemovingResourceId(resourceId)
      p2pAgents.setError(null)

      const ok = await p2pAgents.unshareAgent(resourceId)
      setRemovingResourceId(null)

      if (!ok) {
        await p2pAgents.load()
        return
      }

      setSelectedKeys((keys) => {
        const next = new Set(keys)
        for (const key of keys) {
          if (key.startsWith(`${resourceId}:`)) next.delete(key)
        }
        return next
      })
      await p2pAgents.load()
      return
    }

    setRemovingSessionId(current.groups[0]?.sessionIds[0] ?? null)
    p2pAgents.setError(null)

    for (const group of current.groups) {
      const ok = await p2pAgents.removeSessions(group.resourceId, group.sessionIds)
      if (!ok) {
        setRemovingSessionId(null)
        await p2pAgents.load()
        return
      }
    }

    setRemovingSessionId(null)
    setSelectedKeys((keys) => {
      const next = new Set(keys)
      for (const group of current.groups) {
        for (const sessionId of group.sessionIds) {
          next.delete(agentSelectionKey(group.resourceId, sessionId))
        }
      }
      return next
    })
    await p2pAgents.load()
  }, [pendingDelete, p2pAgents])

  const handleSectionKeysChange = useCallback((resourceId: string, keys: string[]) => {
    setSectionKeysMap((current) => ({ ...current, [resourceId]: keys }))
  }, [])

  const handleSelectAll = useCallback(() => {
    const next = new Set<string>()
    for (const keys of Object.values(sectionKeysMap)) {
      for (const key of keys) next.add(key)
    }
    setSelectedKeys(next)
  }, [sectionKeysMap])

  const handleClearSelection = useCallback(() => {
    setSelectedKeys(new Set())
  }, [])

  const handleDeleteSelected = useCallback(() => {
    const grouped = new Map<string, string[]>()
    for (const key of selectedKeys) {
      const parsed = parseAgentSelectionKey(key)
      if (!parsed) continue
      const bucket = grouped.get(parsed.resourceId) ?? []
      bucket.push(parsed.sessionId)
      grouped.set(parsed.resourceId, bucket)
    }

    if (grouped.size === 0) return

    if (grouped.size === 1) {
      const [resourceId, sessionIds] = [...grouped.entries()][0]!
      requestRemoveSessions(resourceId, sessionIds)
      return
    }

    const total = [...grouped.values()].reduce((sum, ids) => sum + ids.length, 0)
    setPendingDelete({
      kind: 'sessions',
      groups: [...grouped.entries()].map(([resourceId, sessionIds]) => ({
        resourceId,
        sessionIds,
      })),
      message: `确定从群组中移除已勾选的 ${total} 个话题吗？`,
    })
  }, [requestRemoveSessions, selectedKeys])

  const handleContextMenu = useCallback(
    (event: React.MouseEvent) => {
      if (!canManageAgents) return
      event.preventDefault()
      setContextMenu({ x: event.clientX, y: event.clientY })
    },
    [canManageAgents],
  )

  const handleSessionAction = useCallback(
    async (action: GroupAgentSessionAction) => {
      if (!sessionActionMenu) return
      if (!canManagePermission(sessionActionMenu.resource)) return

      const ok = await p2pAgents.setSessionPermission(
        sessionActionMenu.resource.id,
        sessionActionMenu.sessionId,
        action,
      )
      if (!ok) {
        p2pAgents.setError(p2pAgents.error ?? '设置话题权限失败')
        return
      }
      setSessionActionMenu(null)
    },
    [canManagePermission, p2pAgents, sessionActionMenu],
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

  const buildOpenSessionRequest = useCallback(
    (resource: P2pSharedResource, assistant: Assistant | null, session: Session) => {
      const isOwner = selfMemberId != null && resource.sharedBy === selfMemberId
      return {
        p2pWorkspaceId,
        resourceId: resource.localResourceId ?? resource.id,
        sourceSessionId: session.id,
        sessionTitle: session.title,
        groupName: workspaceName,
        sharedAgentName: resolveGroupAgentPanelTitle(resource, assistant),
        permission: getAgentSessionPermission(resource, session.id),
        ownerMemberId: resource.sharedBy,
        sourceAssistantId: assistant?.id ?? resource.localResourceId ?? resource.id,
        referencedModelId: resource.sharedModelId ?? assistant?.modelId ?? 'openai/gpt-4o-mini',
        isOwner,
        localSessionId: isOwner ? session.id : undefined,
      } satisfies OpenGroupAgentSessionRequest
    },
    [p2pWorkspaceId, selfMemberId, workspaceName],
  )

  return (
    <div className="tm-group-member-panel tm-group-resource-panel">
      <GroupPanelHeader
        title={t('groupPage.header.agents')}
        subtitle={`${workspaceName} · ${t('groupPage.panels.count', {
          count: p2pAgents.sharedResources.length,
          type: t('groupPage.panels.types.agents'),
        })}`}
        actions={
          <GroupPanelRefreshButton
            loading={p2pAgents.loading}
            onRefresh={() => void handleRefresh()}
          />
        }
      />

      <div className="tm-kb-file-panel" onContextMenu={handleContextMenu}>
        <button
          type="button"
          className="tm-kb-file-dropzone"
          disabled={
            openingPicker ||
            p2pAgents.sharing ||
            !canWriteWorkspace ||
            !sourceWorkspaceId ||
            !hasShareableAgents
          }
          onClick={() => {
            void (async () => {
              setOpeningPicker(true)
              try {
                await onReloadAssistants?.()
                setShowPicker(true)
              } finally {
                setOpeningPicker(false)
              }
            })()
          }}
        >
          <span className="tm-kb-file-dropzone-title">
            {openingPicker || p2pAgents.sharing
              ? t('groupPage.panels.adding', { type: t('groupPage.panels.types.agents') })
              : t('groupPage.panels.clickAdd', { type: t('groupPage.panels.types.agents') })}
          </span>
          <span className="tm-kb-file-dropzone-hint">
            {addAgentsDisabledReason === 'noAgents'
              ? t('groupPage.panels.addDisabledNoAgents')
              : addAgentsDisabledReason === 'allShared'
                ? t('groupPage.panels.addDisabledAllShared')
                : addAgentsDisabledReason === 'readonly'
                  ? t('groupPage.panels.addDisabledReadonly')
                  : t('groupPage.panels.pickHint', { type: t('groupPage.panels.types.agents') })}
          </span>
          {addAgentsDisabledReason === 'noAgents' ? (
            <span className="tm-kb-file-dropzone-hint">
              {t('groupPage.panels.sharePermissionHint')}
            </span>
          ) : null}
        </button>

        {p2pAgents.loading && p2pAgents.sharedResources.length === 0 ? (
          <div className="tm-kb-file-panel-empty">
            <p>{t('groupPage.panels.loading', { type: t('groupPage.panels.types.agents') })}</p>
          </div>
        ) : p2pAgents.sharedResources.length === 0 ? (
          <div className="tm-kb-file-panel-empty">
            <p>{t('groupPage.panels.empty', { type: t('groupPage.panels.types.agents') })}</p>
          </div>
        ) : (
          <div className="tm-group-shared-knowledge-list">
            {memberSections.map((memberSection) => (
              <GroupMemberResourceSection
                key={memberSection.memberId}
                displayName={memberSection.displayName}
                isSelf={memberSection.isSelf}
                resourceCount={memberSection.resources.length}
                selfLabel={t('groupPage.panels.memberSelf')}
              >
                {memberSection.resources.map((resource) => {
                  const assistant = resolveResourceAssistant(resource)
                  return (
                    <GroupSharedAgentSection
                      key={resource.id}
                      resource={resource}
                      workspaceName={workspaceName}
                      assistant={assistant}
                      isSharer={selfMemberId != null && resource.sharedBy === selfMemberId}
                      sessions={sessions}
                      selectedKeys={selectedKeys}
                      canDelete={canDeleteResource(resource)}
                      removingResourceId={removingResourceId}
                      removingSessionId={removingSessionId}
                      onToggleSelect={handleToggleSelect}
                      onToggleSelectSection={handleToggleSelectSection}
                      onRemoveAgent={() => requestRemoveAgent(resource.id)}
                      onRemoveSession={(sessionId) => handleRemoveSession(resource.id, sessionId)}
                      onOpenSession={onOpenGroupAgentSession}
                      buildOpenSessionRequest={(session) =>
                        buildOpenSessionRequest(resource, assistant, session)
                      }
                      onOpenSessionMenu={(currentResource, sessionId, anchor) =>
                        setSessionActionMenu({
                          resource: currentResource,
                          sessionId,
                          ...anchor,
                        })
                      }
                      onContextMenu={handleContextMenu}
                      onSectionKeysChange={handleSectionKeysChange}
                    />
                  )
                })}
              </GroupMemberResourceSection>
            ))}
          </div>
        )}
      </div>

      {contextMenu ? (
        <GroupFileContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          selectedCount={selectedKeys.size}
          canDelete={canManageAgents}
          onClose={() => setContextMenu(null)}
          onSelectAll={handleSelectAll}
          onClearSelection={handleClearSelection}
          onDeleteSelected={handleDeleteSelected}
        />
      ) : null}

      {pendingDelete ? (
        <ConfirmDialog
          title={pendingDelete.kind === 'agent' ? '移除群组智能体' : '移除共享话题'}
          message={pendingDelete.message}
          confirmLabel="移除"
          danger
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => void confirmDelete()}
        />
      ) : null}

      {showPicker ? (
        <GroupAgentPickerModal
          assistants={shareableAssistants}
          sessions={sessions}
          sharedResources={p2pAgents.sharedResources}
          sourceWorkspaceId={sourceWorkspaceId}
          onClose={() => setShowPicker(false)}
          onConfirm={handleAddAgents}
        />
      ) : null}

      {sessionActionMenu ? (
        <GroupAgentSessionActionMenu
          x={sessionActionMenu.x}
          y={sessionActionMenu.y}
          align={sessionActionMenu.align}
          permission={getAgentSessionPermission(
            p2pAgents.sharedResources.find((item) => item.id === sessionActionMenu.resource.id) ??
              sessionActionMenu.resource,
            sessionActionMenu.sessionId,
          )}
          canSetPermission={canManagePermission(sessionActionMenu.resource)}
          onClose={() => setSessionActionMenu(null)}
          onSelect={(action) => void handleSessionAction(action)}
        />
      ) : null}
    </div>
  )
}
