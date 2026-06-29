import { useCallback } from 'react'
import type { GroupAgentSessionAction } from './GroupAgentSessionActionMenu'
import { getAgentSessionPermission } from './group-agent-utils'
import { buildOpenGroupAgentSessionRequest } from './group-agents-panel-utils'
import type { GroupAgentsPanelProps } from './group-agents-panel-types'
import type { UseGroupAgentsPanelStateResult } from './useGroupAgentsPanelState'

export function useGroupAgentsPanelActions(
  props: GroupAgentsPanelProps,
  state: UseGroupAgentsPanelStateResult,
) {
  const { onOpenGroupAgentSession, onReloadAssistants } = props
  const {
    p2pWorkspaceId,
    workspaceName,
    sourceWorkspaceId,
    selfMemberId,
    shareableAssistants,
    p2pAgents,
    setShowPicker,
    setOpeningPicker,
    canManagePermission,
    sessionActionMenu,
    setSessionActionMenu,
  } = state

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

  const handleOpenPicker = useCallback(() => {
    void (async () => {
      setOpeningPicker(true)
      try {
        await onReloadAssistants?.()
        setShowPicker(true)
      } finally {
        setOpeningPicker(false)
      }
    })()
  }, [onReloadAssistants, setOpeningPicker, setShowPicker])

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
    [canManagePermission, p2pAgents, sessionActionMenu, setSessionActionMenu],
  )

  const buildOpenSessionRequest = useCallback(
    (
      resource: Parameters<typeof buildOpenGroupAgentSessionRequest>[0],
      assistant: Parameters<typeof buildOpenGroupAgentSessionRequest>[1],
      session: Parameters<typeof buildOpenGroupAgentSessionRequest>[2],
    ) =>
      buildOpenGroupAgentSessionRequest(
        resource,
        assistant,
        session,
        p2pWorkspaceId,
        workspaceName,
        selfMemberId,
      ),
    [p2pWorkspaceId, selfMemberId, workspaceName],
  )

  const resolveSessionPermission = useCallback(
    (resourceId: string, sessionId: string) => {
      const resource =
        p2pAgents.sharedResources.find((item) => item.id === resourceId) ??
        sessionActionMenu?.resource
      if (!resource) return 'read' as const
      return getAgentSessionPermission(resource, sessionId)
    },
    [p2pAgents.sharedResources, sessionActionMenu?.resource],
  )

  return {
    handleAddAgents,
    handleOpenPicker,
    handleSessionAction,
    buildOpenSessionRequest,
    resolveSessionPermission,
    onOpenGroupAgentSession,
    shareableAssistants,
  }
}
