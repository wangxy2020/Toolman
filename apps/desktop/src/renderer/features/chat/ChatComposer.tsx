import {
  resolveAssistantLibSessionTts,
  type ContentBlock,
  type TranslationLanguage,
} from '@toolman/shared'
import type { ReactNode } from 'react'
import { useEffect, useMemo } from 'react'
import { getSharedTtsController } from '../voice/tts-controller'
import { useAssistantTts } from '../voice/useAssistantTts'
import type { PendingAttachment } from './chat-attachments'
import { MessageInput } from './MessageInput'
import { MessagePanel } from './MessagePanel'
import type { MessageSettings } from './message-settings'
import type { QuickPhrase } from './quick-phrases'
import type { SlashCommandItem } from './slash-commands'
import {
  resolveAssistantKbEnabled,
  type AppSettings,
} from '../settings/app-settings'
import type { useChat } from './useChat'

type ChatController = ReturnType<typeof useChat>

interface ChatComposerAppSettings {
  webSearchEnabled: boolean
  kbEnabled: boolean
  kbEnabledByAssistantId?: AppSettings['kbEnabledByAssistantId']
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
  onSend?: (contentBlocks: ContentBlock[]) => void | Promise<void>
  loadQuickPhrasesFn?: () => QuickPhrase[]
  extraSlashCommands?: SlashCommandItem[]
  /** Hide MessagePanel empty-state copy when another surface occupies the chat area. */
  hideEmptyState?: boolean
  /** Rendered after the last chat message (legacy list footer). */
  messageListFooter?: ReactNode
  /** Attach footer inside a specific assistant message (preferred for plan apply). */
  assistantFooterMessageId?: string | null
  assistantFooter?: ReactNode
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
  onSend,
  loadQuickPhrasesFn,
  extraSlashCommands,
  hideEmptyState = false,
  messageListFooter,
  assistantFooterMessageId = null,
  assistantFooter = null,
}: ChatComposerProps) {
  const activeAssistant = useMemo(() => {
    const assistantId = chat.activeSession?.assistantId
    if (!assistantId) return null
    return chat.assistants.find((item) => item.id === assistantId) ?? null
  }, [chat.activeSession?.assistantId, chat.assistants])

  const classroomTts = useMemo(
    () => resolveAssistantLibSessionTts(chat.activeSession?.metadata),
    [chat.activeSession?.metadata],
  )
  const autoSpeak = classroomTts
    ? classroomTts.autoSpeak
    : Boolean(activeAssistant?.parameters.autoSpeak)
  const ttsEngine = classroomTts?.ttsEngine ?? activeAssistant?.parameters.ttsEngine
  const ttsVoice = classroomTts?.ttsVoice ?? activeAssistant?.parameters.ttsVoice
  const { playingMessageId, playbackState, speakMessage, pause, resume, stop } =
    useAssistantTts({
      autoSpeak,
      ttsEngine,
      ttsVoice,
      sessionId: chat.activeSessionId,
      messages: chat.messages,
      onError: chat.setError,
    })

  // Dismissing the chat error bar should also clear sticky TTS errors so they
  // do not reappear after switching assistants / remounting the composer.
  useEffect(() => {
    if (chat.error) return
    getSharedTtsController().clearError()
  }, [chat.error])

  const assistantId = activeAssistant?.id ?? null
  const kbEnabled = resolveAssistantKbEnabled(appSettings, assistantId)

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
        hideEmptyState={hideEmptyState}
        listFooter={messageListFooter}
        assistantFooterMessageId={assistantFooterMessageId}
        assistantFooter={assistantFooter}
        speakingMessageId={playingMessageId}
        ttsPlaybackState={playbackState}
        onSpeakMessage={speakMessage}
        onPauseTts={pause}
        onResumeTts={resume}
        onStopTts={stop}
      />
      <MessageInput
        disabled={!chat.activeSessionId || chat.effectiveModelIds.length === 0 || groupProxyReadOnly}
        streaming={chat.sending}
        modelCount={chat.effectiveModelIds.length}
        defaultModelId={defaultModelId}
        defaultFilePath={systemPaths?.documents ?? systemPaths?.home ?? null}
        translationLanguages={translationLanguages}
        webSearchEnabled={appSettings.webSearchEnabled}
        kbEnabled={kbEnabled}
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
        onToggleKb={() => {
          if (!assistantId) {
            onUpdateAppSettings({ kbEnabled: !appSettings.kbEnabled })
            return
          }
          onUpdateAppSettings({
            kbEnabledByAssistantId: {
              ...(appSettings.kbEnabledByAssistantId ?? {}),
              [assistantId]: !kbEnabled,
            },
          })
        }}
        onSend={(contentBlocks: ContentBlock[]) => {
          if (onSend) {
            void onSend(contentBlocks)
            return
          }
          void chat.sendMessage(contentBlocks)
        }}
        onAbort={() => {
          stop()
          void chat.abortStreaming()
        }}
        onError={chat.setError}
        loadQuickPhrasesFn={loadQuickPhrasesFn}
        extraSlashCommands={extraSlashCommands}
      />
    </>
  )
}
