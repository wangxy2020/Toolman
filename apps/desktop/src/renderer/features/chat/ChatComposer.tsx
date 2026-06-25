import type { ContentBlock, TranslationLanguage } from '@toolman/shared'
import type { PendingAttachment } from './chat-attachments'
import { MessageInput } from './MessageInput'
import { MessagePanel } from './MessagePanel'
import type { MessageSettings } from './message-settings'
import type { useChat } from './useChat'

type ChatController = ReturnType<typeof useChat>

interface ChatComposerAppSettings {
  webSearchEnabled: boolean
  kbEnabled: boolean
  spellCheckEnabled: boolean
}

interface ChatComposerProps {
  chat: ChatController
  activeAssistantName: string
  defaultModelId: string | null
  translationLanguages?: [TranslationLanguage, TranslationLanguage]
  messageSettings: MessageSettings
  appSettings: ChatComposerAppSettings
  systemPaths: { documents?: string; home?: string } | null
  groupProxyReadOnly: boolean
  agentPrefillText: string | null
  agentPrefillAttachments: PendingAttachment[] | null
  chatPrefillRevision: number
  onEditUserMessage: (messageId: string) => void
  onPrefillConsumed: () => void
  onUpdateAppSettings: (patch: Partial<ChatComposerAppSettings>) => void
  onSaveToNote: (messageId: string) => void
  onCreateSession: () => void
  onClearSession: () => void
}

export function ChatComposer({
  chat,
  activeAssistantName,
  defaultModelId,
  translationLanguages,
  messageSettings,
  appSettings,
  systemPaths,
  groupProxyReadOnly,
  agentPrefillText,
  agentPrefillAttachments,
  chatPrefillRevision,
  onEditUserMessage,
  onPrefillConsumed,
  onUpdateAppSettings,
  onSaveToNote,
  onCreateSession,
  onClearSession,
}: ChatComposerProps) {
  return (
    <>
      <MessagePanel
        messages={chat.messages}
        loading={chat.loading}
        assistantName={activeAssistantName}
        defaultModelId={defaultModelId}
        translationLanguages={translationLanguages}
        messageSettings={messageSettings}
        sending={chat.sending}
        sendShortcut={messageSettings.sendShortcut}
        pendingMessageAction={chat.pendingMessageAction}
        onDeleteMessage={(id) => void chat.deleteMessage(id)}
        onRegenerateMessage={(id) => void chat.regenerateMessage(id)}
        onEditUserMessage={groupProxyReadOnly ? undefined : onEditUserMessage}
        editingUserMessageId={chat.editingUserMessageId}
        onForkFromMessage={(id) => void chat.forkFromMessage(id)}
        onSaveToNote={onSaveToNote}
        onError={chat.setError}
      />
      <MessageInput
        disabled={!chat.activeSessionId || chat.effectiveModelIds.length === 0 || groupProxyReadOnly}
        streaming={chat.sending}
        modelCount={chat.effectiveModelIds.length}
        defaultModelId={defaultModelId}
        defaultFilePath={systemPaths?.documents ?? systemPaths?.home ?? null}
        translationLanguages={translationLanguages}
        webSearchEnabled={appSettings.webSearchEnabled}
        kbEnabled={appSettings.kbEnabled}
        spellCheckEnabled={appSettings.spellCheckEnabled}
        sendShortcut={messageSettings.sendShortcut}
        onCreateSession={onCreateSession}
        onClearSession={onClearSession}
        prefillText={agentPrefillText}
        prefillAttachments={agentPrefillAttachments}
        prefillRevision={chatPrefillRevision}
        onPrefillConsumed={onPrefillConsumed}
        onToggleWebSearch={() =>
          onUpdateAppSettings({ webSearchEnabled: !appSettings.webSearchEnabled })
        }
        onToggleKb={() => onUpdateAppSettings({ kbEnabled: !appSettings.kbEnabled })}
        onSend={(contentBlocks: ContentBlock[]) => void chat.sendMessage(contentBlocks)}
        onAbort={() => void chat.abortStreaming()}
        onError={chat.setError}
      />
    </>
  )
}
