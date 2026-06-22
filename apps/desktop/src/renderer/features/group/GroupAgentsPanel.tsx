import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Assistant, P2pSharedResource, Session } from '@toolman/shared'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { GroupAgentPickerModal } from './GroupAgentPickerModal'
import {
  GroupAgentSessionActionMenu,
  type GroupAgentSessionAction,
} from './GroupAgentSessionActionMenu'
import { GroupFileContextMenu } from './GroupFileList'
import { GroupPanelHeader } from './GroupPanelHeader'
import { GroupPanelRefreshButton } from './GroupPanelRefreshButton'
import { GroupSharedAgentSection } from './GroupSharedAgentSection'
import { agentSelectionKey, parseAgentSelectionKey } from './group-agent-selection'
import { getAgentSessionPermission, isShareableGroupAgentSource } from './group-agent-utils'
import type { OpenGroupAgentSessionRequest } from './group-agent-open'
import { useP2pAgents } from './useP2pAgents'

interface Props {
  p2pWorkspaceId: string
  workspaceName: string
  sourceWorkspaceId: string | null
  assistants: Assistant[]
  sessions: Session[]
  canManageGroupResources: boolean
  canWriteWorkspace: boolean
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
  selfMemberId,
  onOpenGroupAgentSession,
  onReloadAssistants,
}: Props) {
  const [showPicker, setShowPicker] = useState(false)
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
  const p2pAgents = useP2pAgents({ workspaceId: p2pWorkspaceId })

  useEffect(() => {
    void onReloadAssistants?.()
  }, [onReloadAssistants, p2pAgents.sharedResources])

  useEffect(() => {
    if (!p2pWorkspaceId) return

    const handleAgentEvent = (payload: unknown) => {
      const event = payload as { workspaceId?: string; resourceType?: string }
      if (event.workspaceId !== p2pWorkspaceId || event.resourceType !== 'Agent') return
      void onReloadAssistants?.()
    }

    const unsubscribeAppended = window.api.subscribe('p2p:event:appended', handleAgentEvent)
    const unsubscribeSynced = window.api.subscribe('p2p:sync:event-applied', handleAgentEvent)
    const unsubscribeCompleted = window.api.subscribe('p2p:sync:completed', (payload) => {
      const event = payload as { workspaceId?: string }
      if (event.workspaceId !== p2pWorkspaceId) return
      void onReloadAssistants?.()
    })

    return () => {
      unsubscribeAppended()
      unsubscribeSynced()
      unsubscribeCompleted()
    }
  }, [onReloadAssistants, p2pWorkspaceId])

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
        if (!resource.sharedSessionIds) return false
        const assistantSessions = sessions.filter((item) => item.assistantId === assistant.id)
        return assistantSessions.some((session) => !resource.sharedSessionIds!.includes(session.id))
      }),
    [p2pAgents.sharedResources, sessions, shareableAssistants],
  )

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

  const buildOpenSessionRequest = useCallback(
    (resource: P2pSharedResource, assistant: Assistant | null, session: Session) => {
      const isOwner = selfMemberId != null && resource.sharedBy === selfMemberId
      return {
        p2pWorkspaceId,
        resourceId: resource.id,
        sourceSessionId: session.id,
        sessionTitle: session.title,
        groupName: workspaceName,
        sharedAgentName: resource.name,
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
        title="群组智能体"
        subtitle={`${workspaceName} · ${p2pAgents.sharedResources.length} 个智能体`}
        actions={
          <GroupPanelRefreshButton
            loading={p2pAgents.loading}
            onRefresh={() => void p2pAgents.load()}
          />
        }
      />

      {p2pAgents.error ? <div className="tm-error-bar">{p2pAgents.error}</div> : null}

      <div className="tm-kb-file-panel" onContextMenu={handleContextMenu}>
        <button
          type="button"
          className="tm-kb-file-dropzone"
          disabled={
            p2pAgents.sharing ||
            !canWriteWorkspace ||
            !sourceWorkspaceId ||
            !hasShareableAgents
          }
          onClick={() => setShowPicker(true)}
        >
          <span className="tm-kb-file-dropzone-title">
            {p2pAgents.sharing ? '正在添加智能体…' : '点击添加智能体到群组'}
          </span>
          <span className="tm-kb-file-dropzone-hint">从已有智能体中选择，共享给群组成员</span>
        </button>

        {p2pAgents.loading && p2pAgents.sharedResources.length === 0 ? (
          <div className="tm-kb-file-panel-empty">
            <p>加载智能体列表中…</p>
          </div>
        ) : p2pAgents.sharedResources.length === 0 ? (
          <div className="tm-kb-file-panel-empty">
            <p>暂无群组智能体，点击上方区域添加</p>
          </div>
        ) : (
          <div className="tm-group-shared-knowledge-list">
            {p2pAgents.sharedResources.map((resource) => {
              const assistant = resolveResourceAssistant(resource)
              return (
                <GroupSharedAgentSection
                  key={resource.id}
                  resource={resource}
                  workspaceName={workspaceName}
                  assistant={assistant}
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
