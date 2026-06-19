import { useCallback, type RefObject } from 'react'
import { IpcChannel } from '@toolman/shared'
import {
  applyEdit,
  clearLinePrefix,
  insertCodeBlock,
  insertImageMarkdown,
  insertLinkMarkdown,
  insertMath,
  insertOrderedListPrefix,
  insertTable,
  setLinePrefix,
  toggleWrapSelection,
  type EditResult,
} from './note-editor-utils'
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
  bodyRef: RefObject<HTMLTextAreaElement | null>
  disabled?: boolean
  onContentChange: (value: string) => void
  importAttachment?: (sourcePath: string) => Promise<{ absolutePath: string; name: string } | null>
}

function runSync(
  textarea: HTMLTextAreaElement,
  result: EditResult,
  onContentChange: (value: string) => void,
) {
  applyEdit(textarea, result, onContentChange)
}

export function useNoteEditorActions({
  bodyRef,
  disabled = false,
  onContentChange,
  importAttachment,
}: Options) {
  const withTextarea = useCallback(
    (runner: (textarea: HTMLTextAreaElement) => EditResult | null) => {
      const textarea = bodyRef.current
      if (!textarea || disabled) return false
      const result = runner(textarea)
      if (!result) return false
      runSync(textarea, result, onContentChange)
      return true
    },
    [bodyRef, disabled, onContentChange],
  )

  const runAction = useCallback(
    (key: ActionKey) => {
      switch (key) {
        case 'bold':
          return withTextarea((textarea) => toggleWrapSelection(textarea, '**', '**'))
        case 'italic':
          return withTextarea((textarea) => toggleWrapSelection(textarea, '*', '*'))
        case 'underline':
          return withTextarea((textarea) => toggleWrapSelection(textarea, '<u>', '</u>'))
        case 'strike':
          return withTextarea((textarea) => toggleWrapSelection(textarea, '~~', '~~'))
        case 'code':
          return withTextarea((textarea) => toggleWrapSelection(textarea, '`', '`', '代码'))
        case 'body':
          return withTextarea((textarea) => clearLinePrefix(textarea))
        case 'h1':
          return withTextarea((textarea) => setLinePrefix(textarea, '# ', { toggle: true }))
        case 'h2':
          return withTextarea((textarea) => setLinePrefix(textarea, '## ', { toggle: true }))
        case 'h3':
          return withTextarea((textarea) => setLinePrefix(textarea, '### ', { toggle: true }))
        case 'bullet':
          return withTextarea((textarea) => setLinePrefix(textarea, '- ', { toggle: true }))
        case 'ordered':
          return withTextarea((textarea) => insertOrderedListPrefix(textarea))
        case 'quote':
          return withTextarea((textarea) => setLinePrefix(textarea, '> ', { toggle: true }))
        case 'task':
          return withTextarea((textarea) => setLinePrefix(textarea, '- [ ] ', { toggle: true }))
        case 'codeblock':
          return withTextarea((textarea) => insertCodeBlock(textarea))
        case 'math':
          return withTextarea((textarea) => insertMath(textarea))
        case 'table':
          return withTextarea((textarea) => insertTable(textarea))
        default:
          return false
      }
    },
    [withTextarea],
  )

  const runSlashAction = useCallback(
    (action: NotesSlashAction) => {
      switch (action) {
        case 'h1':
          return runAction('h1')
        case 'h2':
          return runAction('h2')
        case 'h3':
          return runAction('h3')
        case 'body':
          return runAction('body')
        case 'bullet':
          return runAction('bullet')
        case 'ordered':
          return runAction('ordered')
        case 'quote':
          return runAction('quote')
        case 'task':
          return runAction('task')
        case 'code':
          return runAction('code')
        case 'codeblock':
          return runAction('codeblock')
        case 'math':
          return runAction('math')
        case 'table':
          return runAction('table')
        case 'divider':
          return withTextarea((textarea) => ({
            next: `${textarea.value.slice(0, textarea.selectionStart)}\n---\n${textarea.value.slice(textarea.selectionEnd)}`,
            cursor: textarea.selectionStart + 5,
          }))
        case 'image':
          return false
        case 'link':
          return false
        default:
          return false
      }
    },
    [runAction, withTextarea],
  )

  const pickImage = useCallback(async () => {
    const textarea = bodyRef.current
    if (!textarea || disabled) return

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
    runSync(textarea, insertImageMarkdown(textarea, imagePath, imageName), onContentChange)
  }, [bodyRef, disabled, importAttachment, onContentChange])

  const promptLink = useCallback(() => {
    const textarea = bodyRef.current
    if (!textarea || disabled) return

    const url = window.prompt('输入链接地址', 'https://')
    if (url == null) return
    runSync(textarea, insertLinkMarkdown(textarea, url), onContentChange)
  }, [bodyRef, disabled, onContentChange])

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
