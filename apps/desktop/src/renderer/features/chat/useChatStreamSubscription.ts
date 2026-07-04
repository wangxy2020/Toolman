import { IpcChannel, type Message, type MessageStreamEvent } from '@toolman/shared'
import { applyStreamEventWithPendingQueue } from './stream-message-sync'
import type { ChatStreamingRefs } from './useChatMessageRefs'
import type { useSessionManager } from './useSessionManager'

type SessionManager = ReturnType<typeof useSessionManager>

function applyStreamEvents(
  prev: Message[],
  events: MessageStreamEvent[],
  tempToRealId: Map<string, string>,
  pendingStreamEvents: MessageStreamEvent[],
): Message[] {
  return events.reduce(
    (next, event) =>
      applyStreamEventWithPendingQueue(next, event, tempToRealId, pendingStreamEvents),
    prev,
  )
}

export function subscribeChatMessageStream(
  session: SessionManager,
  streamingRefs: ChatStreamingRefs,
  deps: {
    setMessages: (updater: (prev: Message[]) => Message[]) => void
    setSending: (sending: boolean) => void
    setError: (msg: string | null) => void
  },
): () => void {
  const { streamingIds, suppressAbortError, tempToRealIdRef, pendingStreamEventsRef } =
    streamingRefs
  const { setMessages, setSending, setError } = deps
  let deltaFrameId: number | null = null
  const pendingDeltas: MessageStreamEvent[] = []

  const flushDeltas = () => {
    deltaFrameId = null
    if (pendingDeltas.length === 0) return
    const batch = pendingDeltas.splice(0, pendingDeltas.length)
    setMessages((prev) =>
      applyStreamEvents(prev, batch, tempToRealIdRef.current, pendingStreamEventsRef.current),
    )
  }

  const flushDeltasImmediately = () => {
    if (deltaFrameId !== null) {
      cancelAnimationFrame(deltaFrameId)
      deltaFrameId = null
    }
    flushDeltas()
  }

  const scheduleDeltaFlush = () => {
    if (deltaFrameId !== null) return
    deltaFrameId = requestAnimationFrame(flushDeltas)
  }

  const unsubscribe = window.api.subscribe(IpcChannel.MessageStream, (payload) => {
    const event = payload as MessageStreamEvent
    if (session.activeSessionId && event.sessionId !== session.activeSessionId) return

    if (event.type === 'message.delta') {
      pendingDeltas.push(event)
      scheduleDeltaFlush()
      return
    }

    if (event.type === 'message.done') {
      flushDeltasImmediately()
      setMessages((prev) =>
        applyStreamEventWithPendingQueue(
          prev,
          event,
          tempToRealIdRef.current,
          pendingStreamEventsRef.current,
        ),
      )
      streamingIds.current.delete(event.messageId)
      if (streamingIds.current.size === 0) setSending(false)
      void session.loadSessions()
      return
    }

    if (event.type === 'message.error') {
      flushDeltasImmediately()
      if (event.messageId) streamingIds.current.delete(event.messageId)
      setMessages((prev) => {
        if (!event.messageId) return prev
        return applyStreamEventWithPendingQueue(
          prev,
          event,
          tempToRealIdRef.current,
          pendingStreamEventsRef.current,
        )
      })
      if (!(suppressAbortError.current && event.error.code === 'ABORTED') && !event.messageId) {
        setError(event.error.message)
      }
      if (streamingIds.current.size === 0) setSending(false)
    }
  })

  return () => {
    flushDeltasImmediately()
    unsubscribe()
  }
}
