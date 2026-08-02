import { useEffect, useMemo } from 'react'
import {
  applySocraticStateFromAssistantText,
  IpcChannel,
  parseSocraticState,
} from '@toolman/shared'
import { ChatComposer } from '../chat/ChatComposer'
import { getMessageText, getUserFacingMessageText } from '../chat/message-utils'
import type { ChatPageState } from '../chat/useChatPage'
import { useI18n } from '../../i18n/useI18n'

type Props = Pick<
  ChatPageState,
  | 'chat'
  | 'messageSettings'
  | 'defaultModelId'
  | 'translationLanguages'
  | 'groupProxyReadOnly'
  | 'appSettings'
  | 'systemPaths'
  | 'agentPrefillText'
  | 'agentPrefillAttachments'
  | 'chatPrefillRevision'
  | 'handleEditUserMessage'
  | 'handlePrefillConsumed'
  | 'updateAppSettings'
  | 'notes'
>

export function AssistantLibChatPanel(props: Props) {
  const { t } = useI18n()
  const { chat, updateAppSettings, notes } = props

  const activeAssistant = useMemo(() => {
    const assistantId = chat.activeSession?.assistantId
    if (!assistantId) return null
    return chat.assistants.find((item) => item.id === assistantId) ?? null
  }, [chat.activeSession?.assistantId, chat.assistants])

  useEffect(() => {
    const assistantId = activeAssistant?.id
    if (!assistantId || !activeAssistant?.parameters.kbIds?.length) return
    const byAssistant = props.appSettings.kbEnabledByAssistantId ?? {}
    // Seed per-agent KB toggle once for textbook-bound assistants (do not override user choice).
    if (typeof byAssistant[assistantId] === 'boolean') return
    void updateAppSettings({
      kbEnabledByAssistantId: {
        ...byAssistant,
        [assistantId]: true,
      },
    })
  }, [activeAssistant, props.appSettings.kbEnabledByAssistantId, updateAppSettings])

  const latestAssistant = useMemo(() => {
    return [...chat.messages].reverse().find((message) => message.role === 'assistant') ?? null
  }, [chat.messages])

  const understanding = useMemo(() => {
    return parseSocraticState(chat.activeSession?.metadata)
  }, [chat.activeSession?.metadata])

  useEffect(() => {
    if (!chat.activeSession || !latestAssistant || latestAssistant.status !== 'completed') return
    // Keep machine fences in the raw message for parsing; do not surface them in chat UI.
    const text = getMessageText(latestAssistant)
    const nextState = applySocraticStateFromAssistantText(understanding, text)
    if (JSON.stringify(understanding) === JSON.stringify(nextState)) return
    void window.api
      .invoke(IpcChannel.SessionUpdate, {
        id: chat.activeSession.id,
        metadata: {
          ...chat.activeSession.metadata,
          socraticState: nextState,
        },
      })
      .then(() => chat.loadSessions())
  }, [chat, latestAssistant, understanding])

  if (!chat.activeSession) {
    return (
      <div className="tm-kb-file-panel-empty tm-pm-agent-panel-empty">
        <p>{t('assistantLibPage.selectPresetHint')}</p>
      </div>
    )
  }

  return (
    <>
      {chat.error ? (
        <div className="tm-error-bar">
          {chat.error}
          <button type="button" className="tm-error-dismiss" onClick={() => chat.setError(null)}>
            ×
          </button>
        </div>
      ) : null}
      <ChatComposer
        chat={chat}
        activeAssistantName={activeAssistant?.name ?? t('assistantLibPage.title')}
        defaultModelId={props.defaultModelId}
        translationLanguages={props.translationLanguages}
        messageSettings={props.messageSettings}
        appSettings={props.appSettings}
        systemPaths={props.systemPaths}
        groupProxyReadOnly={props.groupProxyReadOnly}
        agentPrefillText={props.agentPrefillText}
        agentPrefillAttachments={props.agentPrefillAttachments}
        chatPrefillRevision={props.chatPrefillRevision}
        onEditUserMessage={props.handleEditUserMessage}
        onPrefillConsumed={props.handlePrefillConsumed}
        onUpdateAppSettings={updateAppSettings}
        onCreateSession={() => void chat.createSession(activeAssistant?.id)}
        onClearSession={() => void chat.clearSessionMessages()}
        onSaveToNote={(messageId) => {
          const message = chat.messages.find((item) => item.id === messageId)
          if (!message) return
          notes.createNoteFromMessage('学习摘录', getUserFacingMessageText(message))
        }}
      />
    </>
  )
}
