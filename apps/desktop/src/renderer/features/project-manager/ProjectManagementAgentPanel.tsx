import { ChatComposer } from '../chat/ChatComposer'
import { getMessageText } from '../chat/message-utils'
import type { ChatPageState } from '../chat/useChatPage'
import { useI18n } from '../../i18n/useI18n'
import { EPC_SLASH_COMMANDS } from '../project-management-epc/epc-slash-commands'
import {
  isProjectManagementAgentTab,
  PROJECT_MANAGEMENT_ASSISTANT_NAME,
} from './projectManagementAgentLink'
import { loadProjectManagementQuickPhrases } from './projectManagementQuickPhrases'
import type { ConfigurableSidebarMenuKey } from './projectSidebarMenuConfig'
import { useProjectManagementAgentSession } from './useProjectManagementAgentSession'
import { useProjectManagementEpcSend } from './useProjectManagementEpcSend'

export type ProjectManagementAgentPanelProps = Pick<
  ChatPageState,
  | 'chat'
  | 'messageSettings'
  | 'messagePanelStyle'
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
  | 'setActiveView'
> & {
  workspaceId: string | null
  activeTab: ConfigurableSidebarMenuKey
}

export function ProjectManagementAgentPanel({
  workspaceId,
  activeTab,
  chat,
  messageSettings,
  defaultModelId,
  translationLanguages,
  groupProxyReadOnly,
  appSettings,
  systemPaths,
  agentPrefillText,
  agentPrefillAttachments,
  chatPrefillRevision,
  handleEditUserMessage,
  handlePrefillConsumed,
  updateAppSettings,
  notes,
  setActiveView,
}: ProjectManagementAgentPanelProps) {
  const { t } = useI18n()
  const { linked, linkState, sessionTitle } = useProjectManagementAgentSession(
    workspaceId,
    chat,
    activeTab,
    true,
    defaultModelId,
  )

  const epcEnabled =
    isProjectManagementAgentTab(activeTab) && activeTab === 'cost_management' && linked != null
  const sendEpcMessage = useProjectManagementEpcSend(chat, linked?.assistant ?? null, epcEnabled)

  if (chat.sessionsLoading || linkState.status === 'loading' || linkState.status === 'idle') {
    return (
      <div className="tm-kb-file-panel-empty tm-pm-agent-panel-empty">
        <p>{t('projectManagerPage.agent.loading')}</p>
      </div>
    )
  }

  if (linkState.status === 'no_model') {
    return (
      <div className="tm-kb-file-panel-empty tm-pm-agent-panel-empty">
        <p>{t('projectManagerPage.agent.noModel')}</p>
      </div>
    )
  }

  if (linkState.status === 'error') {
    return (
      <div className="tm-kb-file-panel-empty tm-pm-agent-panel-empty">
        <p>{linkState.message}</p>
      </div>
    )
  }

  if (!linked) {
    return (
      <div className="tm-kb-file-panel-empty tm-pm-agent-panel-empty">
        <p>
          {t('projectManagerPage.agent.notLinked', {
            assistant: PROJECT_MANAGEMENT_ASSISTANT_NAME,
            session: sessionTitle ?? '',
          })}
        </p>
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
        activeAssistantName={linked.assistant.name}
        defaultModelId={defaultModelId}
        translationLanguages={translationLanguages}
        messageSettings={messageSettings}
        appSettings={appSettings}
        systemPaths={systemPaths}
        groupProxyReadOnly={groupProxyReadOnly}
        agentPrefillText={agentPrefillText}
        agentPrefillAttachments={agentPrefillAttachments}
        chatPrefillRevision={chatPrefillRevision}
        onEditUserMessage={handleEditUserMessage}
        onPrefillConsumed={handlePrefillConsumed}
        onUpdateAppSettings={updateAppSettings}
        onCreateSession={() => void chat.createSession(linked.assistant.id)}
        onClearSession={() => void chat.clearSessionMessages()}
        onSaveToNote={(messageId) => {
          const message = chat.messages.find((item) => item.id === messageId)
          if (!message) return
          const text = getMessageText(message)
          const firstLine = text.split('\n').find((line) => line.trim()) ?? ''
          const title = firstLine.slice(0, 48) || t('projectManagerPage.agent.noteFallbackTitle')
          notes.createNoteFromMessage(title, text)
          setActiveView('notes')
        }}
        onSend={epcEnabled ? sendEpcMessage : undefined}
        loadQuickPhrasesFn={epcEnabled ? loadProjectManagementQuickPhrases : undefined}
        extraSlashCommands={epcEnabled ? EPC_SLASH_COMMANDS : undefined}
      />
    </>
  )
}
