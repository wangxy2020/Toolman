import { useCallback } from 'react'
import type { NoteToolbarActionKey } from './NotesEditorToolbar'
import type { NotesSlashCommandItem } from './notes-slash-commands'

type UseNotesEditorKeyboardParams = {
  locked: boolean
  slashMenuOpen: boolean
  slashCandidates: NotesSlashCommandItem[]
  slashActiveIndex: number
  setSlashActiveIndex: (value: number | ((index: number) => number)) => void
  setSlashMenuOpen: (open: boolean) => void
  runSlashCommand: (item: NotesSlashCommandItem) => Promise<void>
  handleUndo: () => void
  handleRedo: () => void
  handleToolbarAction: (key: NoteToolbarActionKey) => void
  runLink: () => void
}

export function useNotesEditorKeyboard({
  locked,
  slashMenuOpen,
  slashCandidates,
  slashActiveIndex,
  setSlashActiveIndex,
  setSlashMenuOpen,
  runSlashCommand,
  handleUndo,
  handleRedo,
  handleToolbarAction,
  runLink,
}: UseNotesEditorKeyboardParams) {
  return useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (slashMenuOpen && slashCandidates.length > 0) {
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          setSlashActiveIndex((index) => (index + 1) % slashCandidates.length)
          return
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault()
          setSlashActiveIndex(
            (index) => (index - 1 + slashCandidates.length) % slashCandidates.length,
          )
          return
        }
        if (event.key === 'Enter') {
          event.preventDefault()
          const item = slashCandidates[slashActiveIndex]
          if (item) void runSlashCommand(item)
          return
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          setSlashMenuOpen(false)
          return
        }
      }

      const mod = event.metaKey || event.ctrlKey
      if (!mod || locked) return

      if (event.key.toLowerCase() === 'z' && event.shiftKey) {
        event.preventDefault()
        handleRedo()
        return
      }
      if (event.key.toLowerCase() === 'z') {
        event.preventDefault()
        handleUndo()
        return
      }
      if (event.key.toLowerCase() === 'y') {
        event.preventDefault()
        handleRedo()
        return
      }

      const shortcutMap: Record<string, NoteToolbarActionKey> = {
        b: 'bold',
        i: 'italic',
        u: 'underline',
      }
      const action = shortcutMap[event.key.toLowerCase()]
      if (action) {
        event.preventDefault()
        handleToolbarAction(action)
        return
      }
      if (event.key.toLowerCase() === 'k') {
        event.preventDefault()
        runLink()
      }
    },
    [
      handleRedo,
      handleToolbarAction,
      handleUndo,
      locked,
      runLink,
      runSlashCommand,
      setSlashActiveIndex,
      setSlashMenuOpen,
      slashActiveIndex,
      slashCandidates,
      slashMenuOpen,
    ],
  )
}
