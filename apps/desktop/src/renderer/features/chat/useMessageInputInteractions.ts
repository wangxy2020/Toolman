import { useCallback, useEffect, useRef } from 'react'
import { getSystemVoiceInputHint } from './system-voice-input'
import { INPUT_MAX_HEIGHT, INPUT_MIN_HEIGHT } from './message-input-types'
import { insertAtCursor } from './message-input-utils'

export function useMessageInputInteractions({
  text,
  setText,
  fieldHeight,
  setFieldHeight,
}: {
  text: string
  setText: (value: string | ((prev: string) => string)) => void
  fieldHeight: number
  setFieldHeight: (height: number) => void
}) {
  const fieldHeightRef = useRef(fieldHeight)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const voiceHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  fieldHeightRef.current = fieldHeight

  useEffect(() => {
    return () => {
      if (voiceHintTimerRef.current) clearTimeout(voiceHintTimerRef.current)
    }
  }, [])

  const focusTextarea = useCallback((cursor?: number) => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.focus()
    if (cursor != null) {
      textarea.setSelectionRange(cursor, cursor)
    }
  }, [])

  const applyTextInsertion = useCallback(
    (insertion: string) => {
      const textarea = textareaRef.current
      if (!textarea) {
        setText((prev) => (prev ? `${prev} ${insertion}` : insertion))
        return
      }

      const { nextText, cursor } = insertAtCursor(textarea, text, insertion)
      setText(nextText)
      requestAnimationFrame(() => focusTextarea(cursor))
    },
    [focusTextarea, setText, text],
  )

  const handleResizeStart = useCallback((startY: number) => {
    const startHeight = fieldHeightRef.current

    const onPointerMove = (event: PointerEvent) => {
      const deltaY = event.clientY - startY
      const nextHeight = Math.min(
        INPUT_MAX_HEIGHT,
        Math.max(INPUT_MIN_HEIGHT, startHeight - deltaY),
      )
      setFieldHeight(nextHeight)
    }

    const onPointerUp = () => {
      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerup', onPointerUp)
    }

    document.addEventListener('pointermove', onPointerMove)
    document.addEventListener('pointerup', onPointerUp)
  }, [setFieldHeight])

  const createHandleSystemVoiceInput = useCallback(
    (setVoiceHint: (hint: string | null) => void) => () => {
      focusTextarea(text.length)
      const hint = getSystemVoiceInputHint()
      setVoiceHint(hint)
      if (voiceHintTimerRef.current) clearTimeout(voiceHintTimerRef.current)
      voiceHintTimerRef.current = setTimeout(() => setVoiceHint(null), 8000)
    },
    [focusTextarea, text.length],
  )

  return {
    textareaRef,
    applyTextInsertion,
    handleResizeStart,
    createHandleSystemVoiceInput,
  }
}
