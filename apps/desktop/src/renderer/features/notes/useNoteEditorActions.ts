import { useCallback, type RefObject } from 'react'
import { IpcChannel } from '@toolman/shared'
import type { NotesBodyEditorHandle } from './NotesRichBodyEditor'
import type { NotesSlashAction } from './notes-slash-commands'

type ActionKey =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strike'
  | 'code'
  | 'body'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'bullet'
  | 'ordered'
  | 'image'
  | 'codeblock'
  | 'quote'
  | 'task'
  | 'math'
  | 'table'
  | 'link'

interface Options {
  bodyRef: RefObject<NotesBodyEditorHandle | null>
  disabled?: boolean
  onContentChange: (value: string) => void
  importAttachment?: (sourcePath: string) => Promise<{ absolutePath: string; name: string } | null>
}

export function useNoteEditorActions({
  bodyRef,
  disabled = false,
  onContentChange,
  importAttachment,
}: Options) {
  const withEditor = useCallback(
    (runner: (editor: NotesBodyEditorHandle) => boolean) => {
      const editor = bodyRef.current
      if (!editor || disabled) return false
      return runner(editor)
    },
    [bodyRef, disabled],
  )

  const runAction = useCallback(
    (key: ActionKey) =>
      withEditor((editor) => {
        if (key === 'image' || key === 'link') return false
        return editor.runAction(key)
      }),
    [withEditor],
  )

  const runSlashAction = useCallback(
    (action: NotesSlashAction) => {
      switch (action) {
        case 'divider':
          return withEditor((editor) => {
            const offset = editor.getSelectionOffset()
            const value = editor.getMarkdown()
            const next = `${value.slice(0, offset)}\n---\n${value.slice(offset)}`
            onContentChange(next)
            return true
          })
        case 'image':
        case 'link':
          return false
        default:
          return runAction(action)
      }
    },
    [onContentChange, runAction, withEditor],
  )

  const pickImage = useCallback(async () => {
    const editor = bodyRef.current
    if (!editor || disabled) return

    const pickResult = await window.api.invoke(IpcChannel.DialogSelectFiles, {
      multiple: false,
    })
    if (!pickResult.ok) return
    const { paths } = pickResult.data as { paths: string[] }
    const filePath = paths[0]
    if (!filePath) return

    const payload = importAttachment ? await importAttachment(filePath) : null
    const imagePath = payload?.absolutePath ?? filePath
    const imageName = payload?.name
    editor.focus()
    editor.insertImage(imagePath, imageName)
  }, [bodyRef, disabled, importAttachment])

  const promptLink = useCallback(() => {
    const editor = bodyRef.current
    if (!editor || disabled) return

    const url = window.prompt('输入链接地址', 'https://')
    if (url == null) return
    editor.focus()
    editor.insertLink(url)
  }, [bodyRef, disabled])

  const runImage = useCallback(async () => {
    await pickImage()
  }, [pickImage])

  const runLink = useCallback(() => {
    promptLink()
  }, [promptLink])

  return {
    runAction,
    runSlashAction,
    runImage,
    runLink,
    pickImage,
    promptLink,
  }
}
