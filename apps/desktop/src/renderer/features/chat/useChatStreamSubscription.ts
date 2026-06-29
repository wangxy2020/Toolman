import { IpcChannel, type Message, type MessageStreamEvent } from '@toolman/shared'
import { applyStreamEventWithPendingQueue } from './stream-message-sync'
import type { ChatStreamingRefs } from './useChatMessageRefs'
import type { useSessionManager } from './useSessionManager'

type SessionManager = ReturnType<typeof useSessionManager>

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

  return window.api.subscribe(IpcChannel.MessageStream, (payload) => {
    const event = payload as MessageStreamEvent
    if (session.activeSessionId && event.sessionId !== session.activeSessionId) return

    if (event.type === 'message.delta') {
      setMessages((prev) =>
        applyStreamEventWithPendingQueue(
          prev,
          event,
          tempToRealIdRef.current,
          pendingStreamEventsRef.current,
        ),
      )
    }

    if (event.type === 'message.done') {
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
    }

    if (event.type === 'message.error') {
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
}
