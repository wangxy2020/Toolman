import { useCallback, useState } from 'react'

import type { CommunityCommentTarget } from './community-comment-utils'
import { commentTargetKey } from './community-comment-utils'

export function useCommunityCommentExpansion() {
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [counts, setCounts] = useState<Record<string, number>>({})

  const isExpanded = useCallback(
    (target: CommunityCommentTarget) => expandedKey === commentTargetKey(target),
    [expandedKey],
  )

  const toggleExpanded = useCallback((target: CommunityCommentTarget) => {
    const key = commentTargetKey(target)
    setExpandedKey((current) => (current === key ? null : key))
  }, [])

  const setCount = useCallback((target: CommunityCommentTarget, count: number) => {
    const key = commentTargetKey(target)
    setCounts((current) => ({ ...current, [key]: count }))
  }, [])

  const getCount = useCallback(
    (target: CommunityCommentTarget, fallback = 0) => {
      const key = commentTargetKey(target)
      return counts[key] ?? fallback
    },
    [counts],
  )

  return {
    expandedKey,
    isExpanded,
    toggleExpanded,
    setCount,
    getCount,
  }
}
