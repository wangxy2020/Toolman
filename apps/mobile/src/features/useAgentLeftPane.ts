import { useState } from 'react'
import { Alert, Platform } from 'react-native'
import { resolveAgentChatScope } from '../chat/agentScopes'
import { useSidebarLayout } from '../layout'
import { useMobileApp, type ChatSession } from '../state/MobileAppContext'
import { createEmptyAgentSession } from './agentPaneUtils'

export function useAgentLeftPane() {
  const {
    module,
    sessions,
    activeSessionId,
    setActiveSessionId,
    upsertSession,
    renameSession,
    removeSession,
    setLeftOpen,
  } = useMobileApp()
  const agentScope = resolveAgentChatScope(module)
  const scopedSessions = sessions.filter((item) => item.agentScope === agentScope)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null)
  const layout = useSidebarLayout()

  const createSession = () => {
    const session = createEmptyAgentSession(agentScope)
    upsertSession(session)
    setActiveSessionId(session.id)
    setRenamingId(null)
    setOpenSwipeId(null)
    setLeftOpen(false)
  }

  const commitRename = (sessionId: string) => {
    const next = draftTitle.trim()
    if (next) {
      renameSession(sessionId, next)
    }
    setRenamingId(null)
    setDraftTitle('')
  }

  const confirmDelete = (session: ChatSession) => {
    const message = `确定删除「${session.title}」？此操作不可恢复。`
    const doDelete = () => {
      if (renamingId === session.id) {
        setRenamingId(null)
        setDraftTitle('')
      }
      setOpenSwipeId(null)
      removeSession(session.id)
    }

    if (Platform.OS === 'web') {
      if (typeof globalThis.confirm === 'function' && globalThis.confirm(message)) {
        doDelete()
      }
      return
    }

    Alert.alert('删除话题', message, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: doDelete },
    ])
  }

  const beginRename = (session: ChatSession) => {
    setOpenSwipeId(null)
    setActiveSessionId(session.id)
    setRenamingId(session.id)
    setDraftTitle(session.title)
  }

  const selectSession = (sessionId: string) => {
    setOpenSwipeId(null)
    setActiveSessionId(sessionId)
    setLeftOpen(false)
  }

  return {
    scopedSessions,
    activeSessionId,
    renamingId,
    draftTitle,
    setDraftTitle,
    openSwipeId,
    setOpenSwipeId,
    layout,
    createSession,
    commitRename,
    confirmDelete,
    beginRename,
    selectSession,
  }
}
