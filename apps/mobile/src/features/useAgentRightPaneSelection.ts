import { useState } from 'react'
import type { ChatSession } from '../state/MobileAppContext'

export function useAgentRightPaneSelection() {
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())

  const enterMessageSelection = (messageId: string) => {
    setSelectionMode(true)
    setSelectedIds(new Set([messageId]))
  }

  const toggleMessageSelected = (messageId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(messageId)) next.delete(messageId)
      else next.add(messageId)
      return next
    })
  }

  const selectAllMessages = (session: ChatSession | null) => {
    if (!session) return
    setSelectionMode(true)
    setSelectedIds(new Set(session.messages.map((item) => item.id)))
  }

  const clearUserMessageSelection = () => {
    setSelectionMode(false)
    setSelectedIds(new Set())
  }

  const resetSelection = () => {
    setSelectionMode(false)
    setSelectedIds(new Set())
  }

  return {
    selectionMode,
    selectedIds,
    enterMessageSelection,
    toggleMessageSelected,
    selectAllMessages,
    clearUserMessageSelection,
    resetSelection,
  }
}
