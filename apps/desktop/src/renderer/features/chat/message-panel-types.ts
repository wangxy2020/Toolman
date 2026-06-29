import type { Message, TranslationLanguage } from '@toolman/shared'
import type { MessageSettings, SendShortcut } from './message-settings'

export type PendingMessageAction = {
  kind: 'delete' | 'regenerate' | 'fork'
  messageId: string
}

export interface MessagePanelProps {
  messages: Message[]
  loading: boolean
  assistantName: string
  defaultModelId: string | null
  translationLanguages?: [TranslationLanguage, TranslationLanguage]
  messageSettings: MessageSettings
  sending?: boolean
  pendingMessageAction?: PendingMessageAction | null
  onDeleteMessage: (messageId: string) => void
  onRegenerateMessage?: (messageId: string) => void
  onEditUserMessage?: (messageId: string) => void
  onForkFromMessage?: (messageId: string) => void
  editingUserMessageId?: string | null
  onSaveToNote?: (messageId: string) => void
  onError?: (message: string | null) => void
  getUserDisplayName?: (message: Message) => string
  getUserAvatarInitial?: (message: Message) => string
  isOwnUserMessage?: (message: Message) => boolean
  sendShortcut?: SendShortcut
  emptyTitle?: string
  emptyHint?: string
  loadingLabel?: string
}

export type MessageTurn =
  | { type: 'user'; message: Message }
  | { type: 'assistant-group'; messages: Message[] }

export type MessageTranslation = {
  text: string
  targetLanguage: TranslationLanguage
}
