import { useCallback } from 'react'
import type { ContentBlock } from '@toolman/shared'
import type { SlashCommandItem } from './slash-commands'

export function useMessageInputSlashCommands({
  text,
  setSlashMenuOpen,
  clearInput,
  onClearSession,
  onCreateSession,
  onToggleWebSearch,
  sendWithOptions,
  applyTextInsertion,
  setText,
}: {
  text: string
  setSlashMenuOpen: (open: boolean) => void
  clearInput: () => void
  onClearSession?: () => void
  onCreateSession?: () => void
  onToggleWebSearch?: () => void
  sendWithOptions: (contentBlocks: ContentBlock[]) => void
  applyTextInsertion: (insertion: string) => void
  setText: (value: string) => void
}) {
  return useCallback(
    (item: SlashCommandItem) => {
      setSlashMenuOpen(false)

      if (item.action === 'clear') {
        clearInput()
        onClearSession?.()
        return
      }
      if (item.action === 'new-session') {
        onCreateSession?.()
        return
      }
      if (item.action === 'toggle-web-search') {
        onToggleWebSearch?.()
        return
      }
      if (item.insert) {
        if (item.insert.endsWith('。') && !text.trim()) {
          sendWithOptions([{ type: 'text', text: item.insert }])
          setText('')
        } else {
          applyTextInsertion(item.insert)
        }
      }
    },
    [
      applyTextInsertion,
      clearInput,
      onClearSession,
      onCreateSession,
      onToggleWebSearch,
      sendWithOptions,
      setSlashMenuOpen,
      setText,
      text,
    ],
  )
}
