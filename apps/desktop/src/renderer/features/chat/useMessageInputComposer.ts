import { useCallback, useRef, type DragEvent, type RefObject } from 'react'
import type { ContentBlock } from '@toolman/shared'
import {
  pendingAttachmentsToContentBlocks,
  type PendingAttachment,
} from './chat-attachments'
import { getLocalFilePaths } from '../knowledge/knowledge-file-paths'
import {
  POST_SEND_INPUT_SUPPRESS_MS,
  readComposerText,
  shouldIgnoreComposerInput,
} from './message-input-utils'

interface Options {
  disabled: boolean
  text: string
  setText: (value: string) => void
  pendingAttachments: PendingAttachment[]
  setPendingAttachments: (
    value: PendingAttachment[] | ((prev: PendingAttachment[]) => PendingAttachment[]),
  ) => void
  textareaRef: RefObject<HTMLTextAreaElement | null>
  onSend: (contentBlocks: ContentBlock[]) => void
  stagePathsAsAttachments: (paths: string[]) => void | Promise<void>
}

export function useMessageInputComposer({
  disabled,
  text,
  setText,
  pendingAttachments,
  setPendingAttachments,
  textareaRef,
  onSend,
  stagePathsAsAttachments,
}: Options) {
  const suppressNativeInputUntilRef = useRef(0)
  const clearTimersRef = useRef<number[]>([])

  const forceComposerEmpty = useCallback(() => {
    setText('')
    const node = textareaRef.current
    if (node && node.value) node.value = ''
  }, [setText, textareaRef])

  const clearInput = useCallback(() => {
    for (const timer of clearTimersRef.current) clearTimeout(timer)
    clearTimersRef.current = []
    setPendingAttachments([])
    suppressNativeInputUntilRef.current = Date.now() + POST_SEND_INPUT_SUPPRESS_MS
    forceComposerEmpty()
    // System dictation (Fn / Win+H) often commits a final insert after Enter/send.
    clearTimersRef.current = [
      window.setTimeout(forceComposerEmpty, 0),
      window.setTimeout(forceComposerEmpty, 80),
      window.setTimeout(forceComposerEmpty, 200),
    ]
  }, [forceComposerEmpty, setPendingAttachments])

  const sendWithOptions = useCallback(
    (contentBlocks: ContentBlock[]) => {
      onSend(contentBlocks)
    },
    [onSend],
  )

  const liveText = readComposerText(textareaRef.current, text)
  const canSend = Boolean(liveText.trim() || pendingAttachments.length > 0)

  const handleTextChange = useCallback(
    (value: string) => {
      if (shouldIgnoreComposerInput(suppressNativeInputUntilRef.current)) {
        forceComposerEmpty()
        return
      }
      setText(value)
    },
    [forceComposerEmpty, setText],
  )

  const handleSubmit = () => {
    if (disabled) return
    const composerText = readComposerText(textareaRef.current, text)
    if (!composerText.trim() && pendingAttachments.length === 0) return
    sendWithOptions(pendingAttachmentsToContentBlocks(pendingAttachments, composerText))
    clearInput()
  }

  const handleInputDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes('Files')) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleInputDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!event.dataTransfer.types.includes('Files')) return
      event.preventDefault()
      event.stopPropagation()
      void stagePathsAsAttachments(getLocalFilePaths(event.dataTransfer.files, event.dataTransfer))
    },
    [stagePathsAsAttachments],
  )

  return {
    clearTimersRef,
    clearInput,
    sendWithOptions,
    canSend,
    handleTextChange,
    handleSubmit,
    handleInputDragOver,
    handleInputDrop,
  }
}
