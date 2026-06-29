import { useCallback } from 'react'
import {
  buildBulkSessionDelete,
  buildSessionRemovePreview,
  collectAllSectionKeys,
  groupAgentSelectionByResource,
  removeAgentSelectionKeysForResource,
  removeAgentSelectionKeysForSessions,
} from './group-agents-panel-utils'
import type { UseGroupAgentsPanelStateResult } from './useGroupAgentsPanelState'

export function useGroupAgentsPanelDelete(state: UseGroupAgentsPanelStateResult) {
  const {
    t,
    p2pAgents,
    selectedKeys,
    setSelectedKeys,
    setRemovingResourceId,
    setRemovingSessionId,
    pendingDelete,
    setPendingDelete,
    canDeleteResource,
    sectionKeysMap,
    canManageAgents,
    setContextMenu,
  } = state

  const requestRemoveAgent = useCallback(
    (resourceId: string) => {
      const resource = p2pAgents.sharedResources.find((item) => item.id === resourceId)
      if (!resource || !canDeleteResource(resource)) {
        p2pAgents.setError(t('groupPage.confirm.errors.noPermissionAgent'))
        return
      }

      setPendingDelete({
        kind: 'agent',
        groups: [{ resourceId, sessionIds: [] }],
        message: t('groupPage.confirm.agents.removeAgent', { name: resource.name }),
      })
    },
    [canDeleteResource, p2pAgents, setPendingDelete, t],
  )

  const requestRemoveSessions = useCallback(
    (resourceId: string, sessionIds: string[]) => {
      const resource = p2pAgents.sharedResources.find((item) => item.id === resourceId)
      if (!resource || !canDeleteResource(resource)) {
        p2pAgents.setError(t('groupPage.confirm.errors.noPermissionTopics'))
        return
      }

      const { preview, suffix } = buildSessionRemovePreview(sessionIds)

      setPendingDelete({
        kind: 'sessions',
        groups: [{ resourceId, sessionIds }],
        message: t('groupPage.confirm.agents.removeTopics', {
          name: resource.name,
          preview,
          suffix,
        }),
      })
    },
    [canDeleteResource, p2pAgents, setPendingDelete, t],
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

      setSelectedKeys((keys) => removeAgentSelectionKeysForResource(keys, resourceId))
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
    setSelectedKeys((keys) => removeAgentSelectionKeysForSessions(keys, current.groups))
    await p2pAgents.load()
  }, [pendingDelete, p2pAgents, setPendingDelete, setRemovingResourceId, setRemovingSessionId, setSelectedKeys])

  const handleSelectAll = useCallback(() => {
    setSelectedKeys(collectAllSectionKeys(sectionKeysMap))
  }, [sectionKeysMap, setSelectedKeys])

  const handleClearSelection = useCallback(() => {
    setSelectedKeys(new Set())
  }, [setSelectedKeys])

  const handleDeleteSelected = useCallback(() => {
    const grouped = groupAgentSelectionByResource(selectedKeys)
    if (grouped.size === 0) return

    if (grouped.size === 1) {
      const [resourceId, sessionIds] = [...grouped.entries()][0]!
      requestRemoveSessions(resourceId, sessionIds)
      return
    }

    const bulkDelete = buildBulkSessionDelete(grouped, t)
    if (bulkDelete) setPendingDelete(bulkDelete)
  }, [requestRemoveSessions, selectedKeys, setPendingDelete, t])

  const handleContextMenu = useCallback(
    (event: React.MouseEvent) => {
      if (!canManageAgents) return
      event.preventDefault()
      setContextMenu({ x: event.clientX, y: event.clientY })
    },
    [canManageAgents, setContextMenu],
  )

  return {
    requestRemoveAgent,
    requestRemoveSessions,
    handleRemoveSession,
    confirmDelete,
    handleSelectAll,
    handleClearSelection,
    handleDeleteSelected,
    handleContextMenu,
  }
}
