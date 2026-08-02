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

/** Pure helper — exported for unit tests. */
export function resolveThinkingDurationSeconds(options: {
  active: boolean
  startedAtMs: number | null
  storedDurationSeconds: number | null
  frozenDurationSeconds: number | null
  nowMs: number
}): number {
  const { active, startedAtMs, storedDurationSeconds, frozenDurationSeconds, nowMs } = options
  if (active && startedAtMs != null) {
    const live = Math.max(0, Math.round((nowMs - startedAtMs) / 1000))
    return maxDuration(frozenDurationSeconds, storedDurationSeconds, live) ?? 0
  }
  // Finished / historical: never recompute Date.now() - startedAtMs (that grows forever).
  return maxDuration(storedDurationSeconds, frozenDurationSeconds) ?? 0
}

/**
 * Live thinking timer. Prefer main-process `startedAtMs` so the displayed duration is
 * wall-clock thinking time while streaming. Once finished, only the stored/frozen
 * durationSeconds is shown — never "seconds since startedAtMs".
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
    } else if (startRef.current === null && active) {
      startRef.current = Date.now()
    }

    if (!active) {
      // Stream just ended but duration not persisted yet: freeze once from the anchor.
      if (
        frozenDurationRef.current === null &&
        storedDurationSeconds == null &&
        streaming &&
        startRef.current !== null
      ) {
        frozenDurationRef.current = Math.max(
          0,
          Math.round((Date.now() - startRef.current) / 1000),
        )
      }
      const finished = resolveThinkingDurationSeconds({
        active: false,
        startedAtMs: startRef.current,
        storedDurationSeconds,
        frozenDurationSeconds: frozenDurationRef.current,
        nowMs: Date.now(),
      })
      if (finished > 0 || storedDurationSeconds != null || frozenDurationRef.current != null) {
        frozenDurationRef.current = finished
        setDurationSeconds(finished)
      }
      return
    }

    const tick = () => {
      const next = resolveThinkingDurationSeconds({
        active: true,
        startedAtMs: startRef.current,
        storedDurationSeconds,
        frozenDurationSeconds: frozenDurationRef.current,
        nowMs: Date.now(),
      })
      frozenDurationRef.current = next
      setDurationSeconds(next)
    }
    tick()
    const id = window.setInterval(tick, 200)
    return () => window.clearInterval(id)
  }, [streaming, hasThinking, hasAnswerText, active, startedAtMs, storedDurationSeconds])

  return { active, durationSeconds, hasThinking }
}
