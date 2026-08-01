import type { Message, TranslationLanguage } from '@toolman/shared'
import type { ReactNode } from 'react'
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
  /** When true, skip the empty-state title/hint (e.g. another panel already fills the area). */
  hideEmptyState?: boolean
  loadingLabel?: string
  /** Rendered after the last message turn (e.g. plan apply confirm). */
  listFooter?: ReactNode
  /** Attach a footer inside a specific assistant message body. */
  assistantFooterMessageId?: string | null
  assistantFooter?: ReactNode
  /** TTS: currently speaking assistant message id. */
  speakingMessageId?: string | null
  /** TTS: idle | playing | paused */
  ttsPlaybackState?: 'idle' | 'playing' | 'paused'
  /** TTS: play / replay final-answer text for an assistant message. */
  onSpeakMessage?: (messageId: string, text: string) => void
  onPauseTts?: () => void
  onResumeTts?: () => void
  onStopTts?: () => void
}

export type MessageTurn =
  | { type: 'user'; message: Message }
  | { type: 'assistant-group'; messages: Message[] }

export type MessageTranslation = {
  text: string
  targetLanguage: TranslationLanguage
}
