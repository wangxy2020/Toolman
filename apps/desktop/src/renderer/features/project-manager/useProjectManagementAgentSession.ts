import { useEffect, useMemo, useState } from 'react'

import type { useChat } from '../chat/useChat'
import {
  isProjectManagementAgentTab,
  needsProjectManagementSessionMetadata,
  PROJECT_MANAGEMENT_AGENT_SESSION_TITLES,
  resolveProjectManagementAgentSession,
} from './projectManagementAgentLink'
import { ensureProjectManagementAgentLink } from './projectManagementAgentBootstrap'
import {
  isConfigurableSidebarMenuKey,
  type ProjectSidebarMenuTab,
} from './projectSidebarMenuConfig'

type ChatApi = ReturnType<typeof useChat>

export type ProjectManagementAgentLinkState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'linked'; assistantId: string; sessionId: string }
  | { status: 'no_model' }
  | { status: 'error'; message: string }

export function useProjectManagementAgentSession(
  workspaceId: string | null,
  chat: ChatApi,
  activeTab: ProjectSidebarMenuTab,
  enabled: boolean,
  defaultModelId: string | null,
) {
  const agentTab =
    isConfigurableSidebarMenuKey(activeTab) && isProjectManagementAgentTab(activeTab)
      ? activeTab
      : null

  const [linkState, setLinkState] = useState<ProjectManagementAgentLinkState>({ status: 'idle' })

  const linked = useMemo(() => {
    if (!agentTab) return null
    return resolveProjectManagementAgentSession(chat.assistants, chat.sessions, agentTab)
  }, [agentTab, chat.assistants, chat.sessions])

  useEffect(() => {
    if (!enabled || !agentTab || !workspaceId) {
      setLinkState({ status: 'idle' })
      return
    }

    let cancelled = false

    const connect = async () => {
      const existing = resolveProjectManagementAgentSession(
        chat.assistants,
        chat.sessions,
        agentTab,
      )

      if (
        existing &&
        !needsProjectManagementSessionMetadata(existing.session, agentTab)
      ) {
        if (cancelled) return
        setLinkState({
          status: 'linked',
          assistantId: existing.assistant.id,
          sessionId: existing.session.id,
        })
        if (chat.activeSessionId !== existing.session.id) {
          await chat.selectSession(existing.session.id)
        }
        return
      }

      setLinkState({ status: 'loading' })

      const result = await ensureProjectManagementAgentLink(
        workspaceId,
        agentTab,
        chat,
        defaultModelId,
      )

      if (cancelled) return

      if (result.status === 'linked') {
        setLinkState({
          status: 'linked',
          assistantId: result.assistant.id,
          sessionId: result.session.id,
        })
        if (chat.activeSessionId !== result.session.id) {
          await chat.selectSession(result.session.id)
        }
        return
      }

      if (result.status === 'no_model') {
        setLinkState({ status: 'no_model' })
        return
      }

      setLinkState({ status: 'error', message: result.message })
    }

    void connect()

    return () => {
      cancelled = true
    }
  }, [
    agentTab,
    chat.activeSessionId,
    chat.assistants,
    chat.loadAssistants,
    chat.loadSessions,
    chat.selectSession,
    chat.sessions,
    defaultModelId,
    enabled,
    workspaceId,
  ])

  return {
    agentTab,
    linked,
    linkState,
    sessionTitle: agentTab ? (PROJECT_MANAGEMENT_AGENT_SESSION_TITLES[agentTab] ?? null) : null,
  }
}
