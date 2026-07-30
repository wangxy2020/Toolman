import { useEffect, useRef, useState } from 'react'
import type { ContentBlock } from '@toolman/shared'

function readThinkingMeta(blocks: ContentBlock[]): {
  hasThinking: boolean
  startedAtMs: number | null
  storedDurationSeconds: number | null
} {
  const thinking = blocks.find(
    (block): block is Extract<ContentBlock, { type: 'thinking' }> =>
      block.type === 'thinking' && block.text.trim().length > 0,
  )
  if (!thinking) {
    return { hasThinking: false, startedAtMs: null, storedDurationSeconds: null }
  }
  return {
    hasThinking: true,
    startedAtMs:
      typeof thinking.startedAtMs === 'number' && Number.isFinite(thinking.startedAtMs)
        ? thinking.startedAtMs
        : null,
    storedDurationSeconds:
      typeof thinking.durationSeconds === 'number' && Number.isFinite(thinking.durationSeconds)
        ? thinking.durationSeconds
        : null,
  }
}

/**
 * Live thinking timer. Prefer main-process `startedAtMs` so the displayed duration is
 * wall-clock thinking time, not how long the thinking block has been painted.
 */
export function useThinkingMetrics(streaming: boolean, blocks: ContentBlock[]) {
  const { hasThinking, startedAtMs, storedDurationSeconds } = readThinkingMeta(blocks)
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

    // Anchor to main-process start when available; never restart later to a paint time.
    if (startedAtMs != null) {
      startRef.current = startedAtMs
    } else if (startRef.current === null) {
      startRef.current = Date.now()
    }

    if (storedDurationSeconds != null) {
      frozenDurationRef.current = storedDurationSeconds
      setDurationSeconds(storedDurationSeconds)
      if (!active) return
    }

    if (!active) {
      if (frozenDurationRef.current !== null) {
        setDurationSeconds(frozenDurationRef.current)
        return
      }
      if (startRef.current !== null) {
        const elapsed = Math.max(0, Math.round((Date.now() - startRef.current) / 1000))
        frozenDurationRef.current = elapsed
        setDurationSeconds(elapsed)
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
  }, [streaming, hasThinking, hasAnswerText, active, startedAtMs, storedDurationSeconds])

  return { active, durationSeconds, hasThinking }
}
