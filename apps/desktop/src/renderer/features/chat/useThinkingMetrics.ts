import { useEffect, useRef, useState } from 'react'
import type { ContentBlock } from '@toolman/shared'

export function useThinkingMetrics(streaming: boolean, blocks: ContentBlock[]) {
  const hasThinking = blocks.some(
    (block) => block.type === 'thinking' && block.text.trim().length > 0,
  )
  const hasAnswerText = blocks.some(
    (block) => block.type === 'text' && block.text.trim().length > 0,
  )
  const active = streaming && hasThinking && !hasAnswerText

  const startRef = useRef<number | null>(null)
  const frozenDurationRef = useRef<number | null>(null)
  const [durationSeconds, setDurationSeconds] = useState(0)

  useEffect(() => {
    if (!hasThinking) {
      startRef.current = null
      frozenDurationRef.current = null
      setDurationSeconds(0)
      return
    }

    if (startRef.current === null) {
      startRef.current = Date.now()
    }

    if (hasAnswerText) {
      if (frozenDurationRef.current === null && startRef.current !== null) {
        frozenDurationRef.current = Math.max(
          0,
          Math.round((Date.now() - startRef.current) / 1000),
        )
      }
      if (frozenDurationRef.current !== null) {
        setDurationSeconds(frozenDurationRef.current)
      }
      return
    }

    if (!streaming) {
      if (startRef.current !== null) {
        setDurationSeconds(Math.max(0, Math.round((Date.now() - startRef.current) / 1000)))
      }
      return
    }

    const tick = () => {
      if (startRef.current !== null) {
        setDurationSeconds(Math.max(0, Math.round((Date.now() - startRef.current) / 1000)))
      }
    }
    tick()
    const id = window.setInterval(tick, 200)
    return () => window.clearInterval(id)
  }, [streaming, hasThinking, hasAnswerText])

  return { active, durationSeconds, hasThinking }
}
