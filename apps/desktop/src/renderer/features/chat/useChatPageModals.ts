import { useCallback, useEffect, useState } from 'react'
import type { AppView } from '../../types/app-view'

export function useChatPageModals(activeView: AppView) {
  const [showAssistants, setShowAssistants] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [showMessageSettings, setShowMessageSettings] = useState(false)
  const [showAgentSettings, setShowAgentSettings] = useState(false)
  const [showKnowledgeCreate, setShowKnowledgeCreate] = useState(false)
  const [showGroupCreate, setShowGroupCreate] = useState(false)
  const [showGroupJoin, setShowGroupJoin] = useState(false)
  const [showGroupJoinPending, setShowGroupJoinPending] = useState(false)
  const [pendingJoinCancelId, setPendingJoinCancelId] = useState<string | null>(null)
  const [showGroupInvite, setShowGroupInvite] = useState(false)
  const [showMembershipUpgrade, setShowMembershipUpgrade] = useState(false)
  const [notesIngestTarget, setNotesIngestTarget] = useState<{
    noteIds?: string[]
    notebookId?: string
    notebookName?: string
    noteTitle?: string
  } | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  useEffect(() => {
    setShowSearch(false)
  }, [activeView])

  const handleToggleMessageSettings = useCallback(() => {
    setShowMessageSettings((v) => !v)
  }, [])

  return {
    showAssistants,
    setShowAssistants,
    showSearch,
    setShowSearch,
    showMessageSettings,
    setShowMessageSettings,
    showAgentSettings,
    setShowAgentSettings,
    showKnowledgeCreate,
    setShowKnowledgeCreate,
    showGroupCreate,
    setShowGroupCreate,
    showGroupJoin,
    setShowGroupJoin,
    showGroupJoinPending,
    setShowGroupJoinPending,
    pendingJoinCancelId,
    setPendingJoinCancelId,
    showGroupInvite,
    setShowGroupInvite,
    showMembershipUpgrade,
    setShowMembershipUpgrade,
    notesIngestTarget,
    setNotesIngestTarget,
    statusMessage,
    setStatusMessage,
    handleToggleMessageSettings,
  }
}
