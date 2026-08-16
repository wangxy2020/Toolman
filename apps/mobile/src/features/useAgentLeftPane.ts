import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Platform } from 'react-native'
import { resolveAgentChatScope } from '../chat/agentScopes'
import { useSidebarLayout } from '../layout'
import { useMobileApp, type ChatSession } from '../state/MobileAppContext'
import {
  createEmptyAgentSession,
  createMobileAgent,
} from './agentPaneUtils'
import { groupAgentSessionsForSidebar, type AgentSidebarSection } from './groupAgentUtils'

export type AgentRenameTarget =
  | { kind: 'agent'; id: string }
  | { kind: 'session'; id: string }

function confirmAction(title: string, message: string, onConfirm: () => void): void {
  if (Platform.OS === 'web') {
    if (typeof globalThis.confirm === 'function' && globalThis.confirm(message)) {
      onConfirm()
    }
    return
  }
  Alert.alert(title, message, [
    { text: '取消', style: 'cancel' },
    { text: '删除', style: 'destructive', onPress: onConfirm },
  ])
}

export function useAgentLeftPane() {
  const {
    module,
    sessions,
    agents,
    upsertAgent,
    renameAgent,
    removeAgent,
    activeSessionId,
    setActiveSessionId,
    upsertSession,
    renameSession,
    removeSession,
    setLeftOpen,
  } = useMobileApp()
  const agentScope = resolveAgentChatScope(module)
  const scopedSessions = useMemo(
    () => sessions.filter((item) => item.agentScope === agentScope),
    [sessions, agentScope],
  )
  const scopedAgents = useMemo(
    () => agents.filter((agent) => agent.agentScope === agentScope),
    [agents, agentScope],
  )
  const sections = useMemo(
    () => groupAgentSessionsForSidebar(scopedSessions, scopedAgents),
    [scopedSessions, scopedAgents],
  )
  const [renameTarget, setRenameTarget] = useState<AgentRenameTarget | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const layout = useSidebarLayout()
  /** Only auto-expand when the active topic changes — never fight a manual collapse. */
  const lastAutoExpandedForRef = useRef<string | null>(null)

  useEffect(() => {
    if (!activeSessionId || activeSessionId === lastAutoExpandedForRef.current) return
    const activeSection = sections.find((section) =>
      section.sessions.some((session) => session.id === activeSessionId),
    )
    if (!activeSection) return
    lastAutoExpandedForRef.current = activeSessionId
    setExpanded((prev) => {
      if (prev.has(activeSection.key)) return prev
      const next = new Set(prev)
      next.add(activeSection.key)
      return next
    })
  }, [activeSessionId, sections])

  const toggleExpanded = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const setSwipeOpen = (id: string, open: boolean) => {
    setOpenSwipeId(open ? id : null)
  }

  const createAgent = () => {
    const agent = createMobileAgent(agentScope, scopedAgents)
    upsertAgent(agent)
    setExpanded((prev) => new Set(prev).add(agent.id))
    setOpenSwipeId(null)
    setRenameTarget({ kind: 'agent', id: agent.id })
    setDraftTitle(agent.name)
  }

  const createSession = (assistantId: string) => {
    const session = createEmptyAgentSession(agentScope, assistantId)
    upsertSession(session)
    setExpanded((prev) => new Set(prev).add(assistantId))
    setActiveSessionId(session.id)
    setRenameTarget(null)
    setOpenSwipeId(null)
    setLeftOpen(false)
  }

  const commitRename = () => {
    if (!renameTarget) return
    const next = draftTitle.trim()
    if (renameTarget.kind === 'agent') {
      if (next) renameAgent(renameTarget.id, next)
    } else if (next) {
      renameSession(renameTarget.id, next)
    }
    setRenameTarget(null)
    setDraftTitle('')
  }

  const beginRenameSession = (session: ChatSession) => {
    setOpenSwipeId(null)
    setActiveSessionId(session.id)
    setRenameTarget({ kind: 'session', id: session.id })
    setDraftTitle(session.title)
  }

  const confirmDeleteSession = (session: ChatSession) => {
    setOpenSwipeId(null)
    confirmAction('删除话题', `确定删除「${session.title}」？此操作不可恢复。`, () => {
      if (renameTarget?.kind === 'session' && renameTarget.id === session.id) {
        setRenameTarget(null)
        setDraftTitle('')
      }
      removeSession(session.id)
    })
  }

  const confirmDeleteAgent = (section: AgentSidebarSection) => {
    setOpenSwipeId(null)
    if (section.assistantId) {
      confirmAction(
        '删除智能体',
        `确定删除「${section.title}」及其下全部话题？此操作不可恢复。`,
        () => {
          if (renameTarget?.kind === 'agent' && renameTarget.id === section.assistantId) {
            setRenameTarget(null)
            setDraftTitle('')
          }
          setExpanded((prev) => {
            const next = new Set(prev)
            next.delete(section.key)
            return next
          })
          removeAgent(section.assistantId!)
        },
      )
      return
    }

    // Shared / orphan section: remove local proxy (or orphan) topics only.
    const ids = section.sessions.map((session) => session.id)
    if (ids.length === 0) return
    confirmAction(
      '删除共享智能体',
      `确定移除「${section.title}」在本机的全部话题？此操作不可恢复。`,
      () => {
        setExpanded((prev) => {
          const next = new Set(prev)
          next.delete(section.key)
          return next
        })
        for (const id of ids) removeSession(id)
      },
    )
  }

  const selectSession = (sessionId: string) => {
    setOpenSwipeId(null)
    setActiveSessionId(sessionId)
    setLeftOpen(false)
  }

  return {
    sections,
    activeSessionId,
    renameTarget,
    draftTitle,
    setDraftTitle,
    openSwipeId,
    setSwipeOpen,
    expanded,
    toggleExpanded,
    layout,
    createAgent,
    createSession,
    commitRename,
    beginRenameSession,
    confirmDeleteAgent,
    confirmDeleteSession,
    selectSession,
  }
}
