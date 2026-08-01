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

function maxDuration(
  ...values: Array<number | null | undefined>
): number | null {
  let max: number | null = null
  for (const value of values) {
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    max = max === null ? value : Math.max(max, value)
  }
  return max
}

/**
 * Live thinking timer. Prefer main-process `startedAtMs` so the displayed duration is
 * wall-clock thinking time, not how long the thinking block has been painted.
 * Displayed seconds are monotonic — a shorter finalized value must not overwrite a
 * longer live wall-clock reading (e.g. after a mid-stream phase reset).
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

    // Anchor to the earliest known start; never move the clock forward to a later phase.
    if (startedAtMs != null) {
      startRef.current =
        startRef.current === null ? startedAtMs : Math.min(startRef.current, startedAtMs)
    } else if (startRef.current === null) {
      startRef.current = Date.now()
    }

    const elapsedFromStart =
      startRef.current !== null
        ? Math.max(0, Math.round((Date.now() - startRef.current) / 1000))
        : null

    const next = maxDuration(frozenDurationRef.current, storedDurationSeconds, elapsedFromStart)
    if (next !== null) {
      frozenDurationRef.current = next
      setDurationSeconds(next)
    }

    if (!active) return

    const tick = () => {
      if (startRef.current === null) return
      const elapsed = Math.max(0, Math.round((Date.now() - startRef.current) / 1000))
      const grown = maxDuration(frozenDurationRef.current, storedDurationSeconds, elapsed)
      if (grown === null) return
      frozenDurationRef.current = grown
      setDurationSeconds(grown)
    }
    tick()
    const id = window.setInterval(tick, 200)
    return () => window.clearInterval(id)
  }, [streaming, hasThinking, hasAnswerText, active, startedAtMs, storedDurationSeconds])

  return { active, durationSeconds, hasThinking }
}
