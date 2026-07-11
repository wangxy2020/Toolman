import { useEffect, useMemo, useRef } from 'react'

import { ChatComposer } from '../chat/ChatComposer'
import { getBlocksText, getMessageText } from '../chat/message-utils'
import {
  buildPmNewProjectBriefMessageFromProject,
  type ContentBlock,
  type PmProject,
} from '@toolman/shared'
import type { ChatPageState } from '../chat/useChatPage'
import { useI18n } from '../../i18n/useI18n'
import { EPC_SLASH_COMMANDS } from '../project-management-epc/epc-slash-commands'
import {
  isProjectManagementAgentTab,
  PROJECT_MANAGEMENT_ASSISTANT_NAME,
} from './projectManagementAgentLink'
import {
  loadCostManagementQuickPhrases,
  loadExecutionReportQuickPhrases,
  loadPlanManagementQuickPhrases,
  resolvePlanSlashCommand,
} from './planManagementQuickPhrases'
import { PM_PLAN_SLASH_COMMANDS } from './pm-plan-slash-commands'
import { ProjectPlanAgentApplyBar } from './ProjectPlanAgentApplyBar'
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
  selectedProjectId?: string | null
  projects?: PmProject[]
  /** After create-dialog confirm: auto-send plan kickoff for this project. */
  agentKickoffProject?: PmProject | null
  onAgentKickoffConsumed?: () => void
  onPlanApplied?: (projectId: string) => void
  workspace?: import('@toolman/shared').Workspace | null
}

export function ProjectManagementAgentPanel({
  workspaceId,
  activeTab,
  selectedProjectId = null,
  projects = [],
  agentKickoffProject = null,
  onAgentKickoffConsumed,
  onPlanApplied,
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
  const kickoffSentRef = useRef<string | null>(null)

  const epcEnabled =
    isProjectManagementAgentTab(activeTab) && activeTab === 'cost_management' && linked != null
  const planEnabled =
    isProjectManagementAgentTab(activeTab) && activeTab === 'progress_management' && linked != null
  const executionEnabled =
    isProjectManagementAgentTab(activeTab) &&
    (activeTab === 'urgent_tasks' || activeTab === 'all_projects') &&
    linked != null
  const sendEpcMessage = useProjectManagementEpcSend(chat, linked?.assistant ?? null, epcEnabled)

  const lastAssistantMessageId = useMemo(() => {
    for (let index = chat.messages.length - 1; index >= 0; index -= 1) {
      const message = chat.messages[index]
      if (message?.role === 'assistant') return message.id
    }
    return null
  }, [chat.messages])

  const planApplyFooter =
    planEnabled && workspaceId ? (
      <ProjectPlanAgentApplyBar
        workspaceId={workspaceId}
        messages={chat.messages}
        projects={projects}
        selectedProjectId={selectedProjectId}
        pendingBrief={null}
        onPlanApplied={(projectId) => onPlanApplied?.(projectId)}
      />
    ) : null

  const loadQuickPhrasesFn = epcEnabled
    ? loadCostManagementQuickPhrases
    : planEnabled
      ? loadPlanManagementQuickPhrases
      : executionEnabled
        ? loadExecutionReportQuickPhrases
        : undefined

  const extraSlashCommands = epcEnabled
    ? [...EPC_SLASH_COMMANDS, ...PM_PLAN_SLASH_COMMANDS]
    : planEnabled
      ? PM_PLAN_SLASH_COMMANDS
      : executionEnabled
        ? PM_PLAN_SLASH_COMMANDS.filter((item) =>
            ['/daily', '/weekly', '/monthly'].includes(item.command),
          )
        : undefined

  const handleSend = epcEnabled
    ? sendEpcMessage
    : planEnabled || executionEnabled
      ? async (contentBlocks: ContentBlock[]) => {
          const text = getBlocksText(contentBlocks.filter((block) => block.type === 'text'))
          const expanded = resolvePlanSlashCommand(text.trim())
          if (!expanded) {
            await chat.sendMessage(contentBlocks)
            return
          }
          const attachmentBlocks = contentBlocks.filter((block) => block.type !== 'text')
          await chat.sendMessage([{ type: 'text', text: expanded }, ...attachmentBlocks])
        }
      : undefined

  useEffect(() => {
    if (!planEnabled || !linked || !agentKickoffProject) return
    if (kickoffSentRef.current === agentKickoffProject.id) return
    kickoffSentRef.current = agentKickoffProject.id
    const message = buildPmNewProjectBriefMessageFromProject(agentKickoffProject)
    void chat.sendMessage([{ type: 'text', text: message }]).finally(() => {
      onAgentKickoffConsumed?.()
    })
  }, [agentKickoffProject, chat, linked, onAgentKickoffConsumed, planEnabled])

  // Prefer showing an already-resolved session over a loading flash (keep-alive / re-entry).
  if (
    !linked &&
    (chat.sessionsLoading || linkState.status === 'loading' || linkState.status === 'idle')
  ) {
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
        onSend={handleSend}
        loadQuickPhrasesFn={loadQuickPhrasesFn}
        extraSlashCommands={extraSlashCommands}
        assistantFooterMessageId={lastAssistantMessageId}
        assistantFooter={planApplyFooter}
      />
    </>
  )
}
