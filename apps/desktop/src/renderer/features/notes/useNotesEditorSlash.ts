import { useCallback, useEffect, useMemo, useState } from 'react'
import type { RefObject } from 'react'
import { detectSlashQuery } from './note-editor-utils'
import type { NotesBodyEditorHandle } from './NotesRichBodyEditor'
import {
  filterNotesSlashCommands,
  type NotesSlashCommandItem,
} from './notes-slash-commands'
import { useNoteEditorActions } from './useNoteEditorActions'

type UseNotesEditorSlashParams = {
  bodyRef: RefObject<NotesBodyEditorHandle | null>
  noteContent: string
  slashCommands: NotesSlashCommandItem[]
  locked: boolean
  onContentChange: (value: string) => void
  onImportAttachment?: (sourcePath: string) => Promise<{ absolutePath: string; name: string } | null>
  markSkipHistory: () => void
  onUpdate: (patch: { content: string }) => void
}

export function useNotesEditorSlash({
  bodyRef,
  noteContent,
  slashCommands,
  locked,
  onContentChange,
  onImportAttachment,
  markSkipHistory,
  onUpdate,
}: UseNotesEditorSlashParams) {
  const [slashMenuOpen, setSlashMenuOpen] = useState(false)
  const [slashActiveIndex, setSlashActiveIndex] = useState(0)
  const [slashReplaceStart, setSlashReplaceStart] = useState(0)

  const { runAction, runSlashAction, runImage, runLink } = useNoteEditorActions({
    bodyRef,
    disabled: locked,
    onContentChange,
    importAttachment: onImportAttachment,
  })

  const slashCandidates = useMemo(() => {
    if (!slashMenuOpen) return []
    const editor = bodyRef.current
    if (!editor) return slashCommands
    const detected = detectSlashQuery(noteContent, editor.getSelectionOffset())
    if (!detected) return slashCommands
    return filterNotesSlashCommands(detected.query, slashCommands)
  }, [bodyRef, noteContent, slashCommands, slashMenuOpen])

  useEffect(() => {
    if (!slashMenuOpen) return
    setSlashActiveIndex(0)
  }, [slashCandidates.length, slashMenuOpen])

  const updateSlashMenu = useCallback((value: string, cursor: number) => {
    const detected = detectSlashQuery(value, cursor)
    if (detected) {
      setSlashReplaceStart(detected.replaceStart)
      setSlashMenuOpen(true)
      return
    }
    setSlashMenuOpen(false)
  }, [])

  const removeSlashToken = useCallback(() => {
    const editor = bodyRef.current
    if (!editor) return
    const cursor = editor.getSelectionOffset()
    const next = `${noteContent.slice(0, slashReplaceStart)}${noteContent.slice(cursor)}`
    markSkipHistory()
    onUpdate({ content: next })
    requestAnimationFrame(() => {
      editor.focus()
      editor.setSelectionOffset(slashReplaceStart)
    })
  }, [bodyRef, markSkipHistory, noteContent, onUpdate, slashReplaceStart])

  const runSlashCommand = useCallback(
    async (item: NotesSlashCommandItem) => {
      setSlashMenuOpen(false)
      removeSlashToken()
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve())
        })
      })
      if (item.action === 'image') {
        await runImage()
        return
      }
      if (item.action === 'link') {
        runLink()
        return
      }
      runSlashAction(item.action)
    },
    [removeSlashToken, runImage, runLink, runSlashAction],
  )

  const handleToolbarAction = useCallback(
    (key: Parameters<typeof runAction>[0], options?: { fontSizePx?: number }) => {
      if (!runAction(key, options)) return false
      setSlashMenuOpen(false)
      return true
    },
    [runAction],
  )

  return {
    slashMenuOpen,
    setSlashMenuOpen,
    slashActiveIndex,
    setSlashActiveIndex,
    slashCandidates,
    updateSlashMenu,
    runSlashCommand,
    handleToolbarAction,
    runImage,
    runLink,
  }
}
