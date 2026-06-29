import type { MessageStreamEvent } from '@toolman/shared'
import type { MutableRefObject } from 'react'

export type ChatStreamingRefs = {
  streamingIds: MutableRefObject<Set<string>>
  suppressAbortError: MutableRefObject<boolean>
  tempToRealIdRef: MutableRefObject<Map<string, string>>
  pendingStreamEventsRef: MutableRefObject<MessageStreamEvent[]>
}

export function createChatStreamingRefs(): ChatStreamingRefs {
  return {
    streamingIds: { current: new Set<string>() },
    suppressAbortError: { current: false },
    tempToRealIdRef: { current: new Map<string, string>() },
    pendingStreamEventsRef: { current: [] },
  }
}
