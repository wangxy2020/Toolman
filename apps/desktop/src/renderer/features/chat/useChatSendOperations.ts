import type { ContentBlock, Message } from '@toolman/shared'
import type { ChatSendOptions } from './useChatSend'
import type { ChatStreamingRefs } from './useChatMessageRefs'
import type { useSessionManager } from './useSessionManager'

type SessionManager = ReturnType<typeof useSessionManager>

export type ChatSendContext = {
  session: SessionManager
  streamingRefs: ChatStreamingRefs
  effectiveModelIds: string[]
  messages: Message[]
  setMessages: (updater: (prev: Message[]) => Message[]) => void
  setSending: (sending: boolean) => void
  setError: (msg: string | null) => void
  loadMessages: (sessionId: string) => Promise<void>
  setEditingUserMessageId: (id: string | null) => void
  buildSendOptions: (contentBlocks?: ContentBlock[]) => ChatSendOptions
}

export { sendEditedUserMessage } from './useChatSendEdited'
export { sendNewUserMessage } from './useChatSendNew'
