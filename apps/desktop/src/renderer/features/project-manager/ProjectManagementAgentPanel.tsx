import { useEffect, useMemo, useRef } from 'react'

import { ChatComposer } from '../chat/ChatComposer'
import { PlanProjectDisplayNameProvider } from '../chat/PlanProjectDisplayNameContext'
import { getBlocksText, getMessageText } from '../chat/message-utils'
import {
  buildPmNewProjectBriefMessageFromProject,
  getPmAgentCapability,
  resolvePmAgentApplyKindsForMessage,
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
  loadResourceManagementQuickPhrases,
  resolvePlanSlashCommand,
} from './planManagementQuickPhrases'
import { PM_PLAN_SLASH_COMMANDS } from './pm-plan-slash-commands'
import { ProjectCostCatalogApplyBar } from './ProjectCostCatalogApplyBar'
import { ProjectCostPlanApplyBar } from './ProjectCostPlanApplyBar'
import { ProjectPlanAgentApplyBar } from './ProjectPlanAgentApplyBar'
import { ProjectResourceCatalogApplyBar } from './ProjectResourceCatalogApplyBar'
import { ProjectResourcePlanApplyBar } from './ProjectResourcePlanApplyBar'
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
  onProjectsChange?: () => void | Promise<void>
  workspace?: import('@toolman/shared').Workspace | null
}

/**
 * PM agent shell. Tab capabilities come from {@link getPmAgentCapability}
 * (phrases / apply footers / kickoff) so new domains can plug in without more
 * `activeTab ===` hard-coding here.
 */
export function ProjectManagementAgentPanel({
  workspaceId,
  activeTab,
  selectedProjectId = null,
  projects = [],
  agentKickoffProject = null,
  onAgentKickoffConsumed,
  onPlanApplied,
  onProjectsChange,
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

  const capability = isProjectManagementAgentTab(activeTab)
    ? getPmAgentCapability(activeTab)
    : null

  const epcEnabled = capability?.phrases === 'cost' && linked != null
  const planEnabled = capability?.phrases === 'plan' && linked != null
  const executionEnabled = capability?.phrases === 'execution' && linked != null
  const resourceEnabled = capability?.phrases === 'resource' && linked != null
  const sendEpcMessage = useProjectManagementEpcSend(chat, linked?.assistant ?? null, epcEnabled)

  const lastAssistantMessageId = useMemo(() => {
    for (let index = chat.messages.length - 1; index >= 0; index -= 1) {
      const message = chat.messages[index]
      if (message?.role === 'assistant') return message.id
    }
    return null
  }, [chat.messages])

  const lastAssistantText = useMemo(() => {
    for (let index = chat.messages.length - 1; index >= 0; index -= 1) {
      const message = chat.messages[index]
      if (message?.role === 'assistant') return getMessageText(message)
    }
    return ''
  }, [chat.messages])

  const applyKinds = useMemo(
    () => resolvePmAgentApplyKindsForMessage(lastAssistantText, capability?.apply ?? []),
    [capability?.apply, lastAssistantText],
  )
  const assistantFooter =
    linked && workspaceId && applyKinds.length > 0 ? (
      <>
        {applyKinds.includes('plan') || applyKinds.includes('schedule') ? (
          <ProjectPlanAgentApplyBar
            workspaceId={workspaceId}
            messages={chat.messages}
            projects={projects}
            selectedProjectId={selectedProjectId}
            onPlanApplied={(projectId) => onPlanApplied?.(projectId)}
            onProjectsChange={onProjectsChange}
          />
        ) : null}
        {applyKinds.includes('resourcePlan') ? (
          <ProjectResourcePlanApplyBar
            workspaceId={workspaceId}
            messages={chat.messages}
            projects={projects}
            selectedProjectId={selectedProjectId}
            onPlanApplied={(projectId) => onPlanApplied?.(projectId)}
            onProjectsChange={onProjectsChange}
          />
        ) : null}
        {applyKinds.includes('resourceCatalog') ? (
          <ProjectResourceCatalogApplyBar
            workspaceId={workspaceId}
            messages={chat.messages}
            onProjectsChange={onProjectsChange}
          />
        ) : null}
        {applyKinds.includes('costPlan') ? (
          <ProjectCostPlanApplyBar
            workspaceId={workspaceId}
            messages={chat.messages}
            projects={projects}
            selectedProjectId={selectedProjectId}
            onPlanApplied={(projectId) => onPlanApplied?.(projectId)}
            onProjectsChange={onProjectsChange}
          />
        ) : null}
        {applyKinds.includes('costCatalog') ? (
          <ProjectCostCatalogApplyBar
            workspaceId={workspaceId}
            messages={chat.messages}
            onProjectsChange={onProjectsChange}
          />
        ) : null}
      </>
    ) : null

  const loadQuickPhrasesFn = epcEnabled
    ? loadCostManagementQuickPhrases
    : planEnabled
      ? loadPlanManagementQuickPhrases
      : executionEnabled
        ? loadExecutionReportQuickPhrases
        : resourceEnabled
          ? loadResourceManagementQuickPhrases
          : undefined

  const extraSlashCommands = epcEnabled
    ? [...EPC_SLASH_COMMANDS, ...PM_PLAN_SLASH_COMMANDS]
    : planEnabled
      ? PM_PLAN_SLASH_COMMANDS.filter((item) =>
          ['/wbs', '/schedule', '/resource'].includes(item.command),
        )
      : executionEnabled
        ? PM_PLAN_SLASH_COMMANDS.filter((item) =>
            ['/daily', '/weekly', '/monthly'].includes(item.command),
          )
        : resourceEnabled
          ? PM_PLAN_SLASH_COMMANDS.filter((item) => item.command === '/catalog')
          : undefined

  const handleSend =
    epcEnabled
      ? sendEpcMessage
      : planEnabled || executionEnabled || resourceEnabled
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
    if (!capability?.kickoff || !linked || !agentKickoffProject) return
    if (kickoffSentRef.current === agentKickoffProject.id) return
    kickoffSentRef.current = agentKickoffProject.id
    const message = buildPmNewProjectBriefMessageFromProject(agentKickoffProject)
    void chat.sendMessage([{ type: 'text', text: message }]).finally(() => {
      onAgentKickoffConsumed?.()
    })
  }, [agentKickoffProject, capability?.kickoff, chat, linked, onAgentKickoffConsumed])

  const selectedProjectLabel = useMemo(() => {
    const project = projects.find((entry) => entry.id === selectedProjectId)
    if (!project) return null
    const code = project.code?.trim() ?? ''
    const name = project.name?.trim() ?? ''
    if (code && name) return `${code} · ${name}`
    return name || code || null
  }, [projects, selectedProjectId])

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
    <PlanProjectDisplayNameProvider projectName={selectedProjectLabel}>
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
        assistantFooter={assistantFooter}
      />
    </PlanProjectDisplayNameProvider>
  )
}
