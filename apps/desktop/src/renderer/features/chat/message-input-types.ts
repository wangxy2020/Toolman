import type { ContentBlock, TranslationLanguage } from '@toolman/shared'
import type { PendingAttachment } from './chat-attachments'
import type { SendShortcut } from './message-settings'
import type { QuickPhrase } from './quick-phrases'
import type { SlashCommandItem } from './slash-commands'

export interface MessageInputProps {
  disabled: boolean
  streaming: boolean
  modelCount?: number
  defaultModelId: string | null
  defaultFilePath?: string | null
  translationLanguages?: [TranslationLanguage, TranslationLanguage]
  webSearchEnabled?: boolean
  kbEnabled?: boolean
  spellCheckEnabled?: boolean
  sendShortcut?: SendShortcut
  onCreateSession?: () => void
  onClearSession?: () => void
  onToggleWebSearch?: () => void
  onToggleKb?: () => void
  prefillText?: string | null
  prefillAttachments?: PendingAttachment[] | null
  prefillRevision?: number
  onPrefillConsumed?: () => void
  onSend: (contentBlocks: ContentBlock[]) => void
  onAbort: () => void
  onError?: (message: string | null) => void
  toolbarMode?: 'agent' | 'group'
  groupIsOwner?: boolean
  loadQuickPhrasesFn?: () => QuickPhrase[]
  extraSlashCommands?: SlashCommandItem[]
}

export const INPUT_MIN_HEIGHT = 66
export const INPUT_MAX_HEIGHT = 200
