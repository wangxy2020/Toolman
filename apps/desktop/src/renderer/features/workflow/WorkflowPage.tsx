import { useEffect, useMemo, useRef, useState } from 'react'
import type { Workspace } from '@toolman/shared'
import { AgentSettingsModal } from '../chat/AgentSettingsModal'
import { ChatComposer } from '../chat/ChatComposer'
import { getMessageText } from '../chat/message-utils'
import type { ChatPageState } from '../chat/useChatPage'
import { useI18n } from '../../i18n/useI18n'
import {
  bindAutomationSubTaskSession,
  ensureActiveAutomationChatSession,
} from './automation-session-binding'
import { ensureAutomationAssistant } from './automationAgentBootstrap'
import { resolveAutomationAssistant } from './resolve-automation-assistant'
import { WorkflowPageHeader } from './WorkflowPageHeader'
import { WorkflowTaskSettingsModal } from './WorkflowTaskSettingsModal'
import { useWorkflows } from './useWorkflows'

export type WorkflowPageProps = Pick<
  ChatPageState,
  | 'messageSettings'
  | 'messagePanelStyle'
  | 'workspace'
  | 'workspaceId'
  | 'chat'
  | 'headerModelIds'
  | 'handleModelChange'
  | 'handleSelectWorkspaceFolder'
  | 'handleCodeEditorChange'
  | 'handleOpenSettings'
  | 'statusMessage'
  | 'setStatusMessage'
  | 'defaultModelId'
  | 'translationLanguages'
  | 'appSettings'
  | 'systemPaths'
  | 'groupProxyReadOnly'
  | 'agentPrefillText'
  | 'agentPrefillAttachments'
  | 'chatPrefillRevision'
  | 'handleEditUserMessage'
  | 'handlePrefillConsumed'
  | 'updateAppSettings'
  | 'notes'
  | 'setActiveView'
> & {
  setWorkspace: (workspace: Workspace) => void
}

export function WorkflowPage(props: WorkflowPageProps) {
  const {
    messageSettings,
    messagePanelStyle,
    workspace,
    workspaceId,
    chat,
    headerModelIds,
    handleModelChange,
    handleSelectWorkspaceFolder,
    handleCodeEditorChange,
    handleOpenSettings,
    statusMessage,
    setStatusMessage,
    defaultModelId,
    translationLanguages,
    appSettings,
    systemPaths,
    groupProxyReadOnly,
    agentPrefillText,
    agentPrefillAttachments,
    chatPrefillRevision,
    handleEditUserMessage,
    handlePrefillConsumed,
    updateAppSettings,
    notes,
    setActiveView,
    setWorkspace,
  } = props

  const { t } = useI18n()
  const { active, activeTask, error, linkSession } = useWorkflows()
  const [showTaskSettings, setShowTaskSettings] = useState(false)
  const [showAutomationSettings, setShowAutomationSettings] = useState(false)

  const automationAssistant = useMemo(
    () => resolveAutomationAssistant(chat.assistants),
    [chat.assistants],
  )

  useEffect(() => {
    if (!workspaceId) return
    let cancelled = false
    void (async () => {
      const assistant = await ensureAutomationAssistant({
        workspaceId,
        chat,
        defaultModelId,
      })
      if (cancelled || !assistant) return

      // Subtask: bind/migrate sessionId away from 课堂 if needed.
      if (active?.parentId) {
        if (cancelled) return
        await bindAutomationSubTaskSession({
          item: active,
          automationAssistant: assistant,
          chat,
          linkSession,
        })
        return
      }

      // Task-level / empty: still leave any non-automation active session.
      if (cancelled) return
      await ensureActiveAutomationChatSession({
        automationAssistant: assistant,
        chat,
        preferredSessionId: null,
      })
    })()
    return () => {
      cancelled = true
    }
    // chat methods are stable enough; assistants list / active subtask drive rebind
  }, [
    workspaceId,
    defaultModelId,
    chat.assistants.length,
    chat.loadAssistants,
    active?.id,
    active?.sessionId,
    active?.parentId,
    linkSession,
  ])

  const onAutomationSession =
    automationAssistant != null && chat.activeSession?.assistantId === automationAssistant.id

  const sendMessageRef = useRef(chat.sendMessage)
  sendMessageRef.current = chat.sendMessage

  const workflowModelIds = useMemo(() => {
    if (onAutomationSession) return headerModelIds
    return automationAssistant?.modelId ? [automationAssistant.modelId] : headerModelIds
  }, [automationAssistant?.modelId, headerModelIds, onAutomationSession])

  const workflowDefaultModelId = onAutomationSession
    ? defaultModelId
    : (automationAssistant?.modelId ?? defaultModelId)

  const workflowTranslationLanguages = onAutomationSession
    ? translationLanguages
    : automationAssistant?.parameters.translationLanguages

  const breadcrumbName = active?.parentId ? active.name : (activeTask?.name ?? null)

  return (
    <>
      <main
        className={[
          'tm-main',
          messageSettings.useSerifFont ? 'tm-main--serif' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={messagePanelStyle}
      >
        <WorkflowPageHeader
          taskName={breadcrumbName}
          workspace={workspace}
          providers={chat.providers}
          selectedModelIds={workflowModelIds}
          onModelChange={handleModelChange}
          onSelectWorkspaceFolder={() => void handleSelectWorkspaceFolder()}
          onCodeEditorChange={(editorId) => void handleCodeEditorChange(editorId)}
          onOpenTaskSettings={() => setShowTaskSettings(true)}
          onOpenAutomationSettings={() => setShowAutomationSettings(true)}
          automationSettingsOpen={showAutomationSettings}
          hasConfiguredProvider={chat.hasConfiguredProvider}
          onOpenSettings={() => handleOpenSettings('model-service')}
        />

        {(chat.error || error) && (
          <div className="tm-error-bar">
            {chat.error || error}
            <button
              type="button"
              className="tm-error-dismiss"
              onClick={() => {
                chat.setError(null)
              }}
            >
              ×
            </button>
          </div>
        )}

        {statusMessage ? (
          <div className="tm-status-bar">
            {statusMessage}
            <button
              type="button"
              className="tm-error-dismiss"
              onClick={() => setStatusMessage(null)}
            >
              ×
            </button>
          </div>
        ) : null}

        <ChatComposer
          chat={chat}
          activeAssistantName={
            automationAssistant?.name ?? t('modules.workflow.title')
          }
          defaultModelId={workflowDefaultModelId}
          translationLanguages={workflowTranslationLanguages}
          messageSettings={messageSettings}
          appSettings={appSettings}
          systemPaths={systemPaths}
          groupProxyReadOnly={groupProxyReadOnly}
          agentPrefillText={agentPrefillText}
          agentPrefillAttachments={agentPrefillAttachments}
          chatPrefillRevision={chatPrefillRevision}
          onEditUserMessage={(id) => handleEditUserMessage(id)}
          onPrefillConsumed={handlePrefillConsumed}
          onUpdateAppSettings={updateAppSettings}
          onCreateSession={() => void chat.createSession(automationAssistant?.id)}
          onClearSession={() => void chat.clearSessionMessages()}
          onSend={async (contentBlocks) => {
            if (!automationAssistant) return
            if (!onAutomationSession) {
              if (active?.parentId) {
                await bindAutomationSubTaskSession({
                  item: active,
                  automationAssistant,
                  chat,
                  linkSession,
                })
              } else {
                await ensureActiveAutomationChatSession({
                  automationAssistant,
                  chat,
                  preferredSessionId: null,
                })
              }
              // Let React commit the rebound active session before send.
              await new Promise<void>((resolve) => {
                requestAnimationFrame(() => resolve())
              })
            }
            await sendMessageRef.current(contentBlocks)
          }}
          onSaveToNote={(messageId) => {
            const message = chat.messages.find((item) => item.id === messageId)
            if (!message) return
            const text = getMessageText(message)
            const firstLine = text.split('\n').find((line) => line.trim()) ?? ''
            const title = firstLine.slice(0, 48) || t('workflowPage.noteExcerpt')
            notes.createNoteFromMessage(title, text)
            setActiveView('notes')
          }}
        />
      </main>

      {showAutomationSettings && automationAssistant ? (
        <AgentSettingsModal
          assistant={automationAssistant}
          workspace={workspace}
          providers={chat.providers}
          activeSession={chat.activeSession}
          onClose={() => setShowAutomationSettings(false)}
          onSaved={async () => {
            const items = await chat.loadAssistants()
            const updated = items.find((item) => item.id === automationAssistant.id)
            if (updated?.modelId) {
              chat.setSelectedModelIds([updated.modelId])
            }
          }}
          onWorkspaceUpdated={setWorkspace}
        />
      ) : null}

      <WorkflowTaskSettingsModal
        open={showTaskSettings}
        onClose={() => setShowTaskSettings(false)}
      />
    </>
  )
}
