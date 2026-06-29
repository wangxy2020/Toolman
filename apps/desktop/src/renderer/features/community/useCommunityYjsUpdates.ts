import { useEffect, type Dispatch, type SetStateAction } from 'react'
import {
  CommunityBoardMessageSchema,
  CommunityYjsUpdateEventSchema,
  type CommunityBoardMessage,
  type CommunityYjsUpdateEvent,
} from '@toolman/shared'

function mergeBoardMessage(
  current: CommunityBoardMessage[],
  event: CommunityYjsUpdateEvent,
): CommunityBoardMessage[] {
  if (event.action === 'delete') {
    return current.filter((item) => item.id !== event.entityId)
  }

  const parsed = CommunityBoardMessageSchema.safeParse(event.entity)
  if (!parsed.success) return current

  const next = current.filter((item) => item.id !== parsed.data.id)
  next.unshift(parsed.data)
  return next.sort((left, right) => right.createdAt - left.createdAt)
}

export function useCommunityYjsBoardUpdates(
  setItems: Dispatch<SetStateAction<CommunityBoardMessage[]>>,
) {
  useEffect(() => {
    const unsubscribe = window.api.subscribe('community:yjs:update', (payload) => {
      const parsed = CommunityYjsUpdateEventSchema.safeParse(payload)
      if (!parsed.success || parsed.data.domain !== 'board') return

      setItems((current) => mergeBoardMessage(current, parsed.data))
    })
    return unsubscribe
  }, [setItems])
}
