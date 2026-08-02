import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  IpcChannel,
  isAssistantLibDefaultClassroomSession,
  parseSocraticState,
  type KnowledgeBase,
} from '@toolman/shared'
import { useI18n } from '../../i18n/useI18n'
import type { ChatPageState } from '../chat/useChatPage'
import { AssistantLibChatPanel } from './AssistantLibChatPanel'
import { AssistantLibClassroomRecords } from './AssistantLibClassroomRecords'
import {
  AssistantLibCreateCourseDialog,
  type AssistantLibCreateCourseInput,
} from './AssistantLibCreateCourseDialog'
import { AssistantLibSettingsDialog } from './AssistantLibSettingsDialog'
import { AssistantLibToolbar } from './AssistantLibToolbar'
import { createLocalTextbookKnowledgeBase } from './create-textbook-kb'
import {
  setAssistantLibPanelView,
  useAssistantLibPanelView,
} from './assistant-lib-panel-view'
import {
  closeAssistantLibCreateCourse,
  closeAssistantLibSettings,
  useAssistantLibUiState,
} from './assistant-lib-ui'
import { useAssistantLibBootstrap } from './hooks/useAssistantLibBootstrap'
import { useAssistantLibSessions } from './hooks/useAssistantLibSessions'
import './assistant-lib.css'

export type AssistantLibPageProps = Pick<
  ChatPageState,
  | 'workspaceId'
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
  | 'setActiveView'
  | 'handleReloadAssistants'
  | 'setStatusMessage'
  | 'knowledgeFolder'
>

function buildShareSummary(title: string, metadata: Record<string, unknown> | undefined): string {
  const state = parseSocraticState(metadata)
  return [
    `# ${title}`,
    '',
    `已确认：${state.confirmedClaims.join('；') || '—'}`,
    `待澄清：${state.openAssumptions.join('；') || '—'}`,
    `已掌握：${state.mastered.join('；') || '—'}`,
  ].join('\n')
}

export function AssistantLibPage(props: AssistantLibPageProps) {
  const { t } = useI18n()
  const ui = useAssistantLibUiState()
  const panelView = useAssistantLibPanelView()
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([])
  const [submittingCourse, setSubmittingCourse] = useState(false)
  const { sharedAssistant, learningSessions } = useAssistantLibSessions(
    props.chat.assistants,
    props.chat.sessions,
  )
  const { busy, error, startCourse, ensureDefaultClassroom } = useAssistantLibBootstrap({
    workspaceId: props.workspaceId,
    defaultModelId: props.defaultModelId,
    assistants: props.chat.assistants,
    sessions: props.chat.sessions,
    onReady: props.handleReloadAssistants,
  })

  const activeSessionId = props.chat.activeSessionId
  const activeAssistantId = props.chat.activeSession?.assistantId ?? null
  const selectSession = props.chat.selectSession

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const linked = await ensureDefaultClassroom()
      if (cancelled || !linked) return
      const activeBelongsToLib = activeAssistantId === linked.assistant.id
      if (!activeBelongsToLib) {
        await selectSession(linked.session.id)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [ensureDefaultClassroom, activeAssistantId, selectSession])

  const activeLearningSession = useMemo(() => {
    if (activeSessionId && sharedAssistant && activeAssistantId === sharedAssistant.id) {
      return learningSessions.find((item) => item.id === activeSessionId) ?? null
    }
    return (
      learningSessions.find((item) => isAssistantLibDefaultClassroomSession(item.metadata)) ??
      learningSessions[0] ??
      null
    )
  }, [learningSessions, activeAssistantId, activeSessionId, sharedAssistant])

  useEffect(() => {
    setAssistantLibPanelView('agent')
  }, [])

  useEffect(() => {
    if (!props.workspaceId) return
    void window.api.invoke(IpcChannel.KnowledgeBaseList, { workspaceId: props.workspaceId }).then((result) => {
      if (!result.ok) return
      const data = result.data as { items?: KnowledgeBase[] }
      setKnowledgeBases(data.items ?? [])
    })
  }, [props.workspaceId])

  const reloadKnowledgeBases = useCallback(async () => {
    if (!props.workspaceId) return
    const result = await window.api.invoke(IpcChannel.KnowledgeBaseList, {
      workspaceId: props.workspaceId,
    })
    if (!result.ok) return
    const data = result.data as { items?: KnowledgeBase[] }
    setKnowledgeBases(data.items ?? [])
  }, [props.workspaceId])

  const handleStart = useCallback(
    async (input: AssistantLibCreateCourseInput) => {
      if (!props.workspaceId) return
      setSubmittingCourse(true)
      try {
        let kbIds = input.kbIds
        if (input.textbookSource === 'local' && input.textbookFilePaths?.length) {
          const created = await createLocalTextbookKnowledgeBase({
            workspaceId: props.workspaceId,
            name: input.courseName,
            defaultLocalFolderPath: props.knowledgeFolder.path,
            filePaths: input.textbookFilePaths,
          })
          if (created.warning) props.setStatusMessage?.(created.warning)
          kbIds = [created.kb.id]
          await reloadKnowledgeBases()
        }

        const result = await startCourse({
          presetId: input.presetId,
          customName: input.courseName,
          kbIds,
        })
        if (!result) return
        await props.handleReloadAssistants()
        await props.chat.selectSession(result.session.id)
        setAssistantLibPanelView('agent')
        closeAssistantLibCreateCourse()
        if (kbIds?.length && result.assistant.id) {
          const assistantId = result.assistant.id
          const byAssistant = props.appSettings.kbEnabledByAssistantId ?? {}
          if (typeof byAssistant[assistantId] !== 'boolean') {
            void props.updateAppSettings({
              kbEnabledByAssistantId: {
                ...byAssistant,
                [assistantId]: true,
              },
            })
          }
        }
      } catch (err) {
        props.setStatusMessage?.(err instanceof Error ? err.message : String(err))
      } finally {
        setSubmittingCourse(false)
      }
    },
    [props, reloadKnowledgeBases, startCourse],
  )

  const shareSummary = useCallback(() => {
    return buildShareSummary(
      activeLearningSession?.title ?? t('assistantLibPage.title'),
      activeLearningSession?.metadata,
    )
  }, [activeLearningSession, t])

  const showRecords = panelView === 'records'
  const secondaryLabel = showRecords
    ? t('assistantLibPage.records.title')
    : (activeLearningSession?.title ?? t('assistantLibPage.defaultCourse'))

  return (
    <main
      className={[
        'tm-main',
        'tm-project-manager-page',
        'tm-alib-page',
        showRecords ? '' : 'tm-project-manager-page--agent',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <header className="tm-chat-header">
        <div className="tm-chat-breadcrumb">
          <span className="tm-model-pill tm-module-pill">{t('assistantLibPage.title')}</span>
          <span className="tm-module-breadcrumb-group">
            <span className="tm-chat-breadcrumb-sep">/</span>
            <span className="tm-model-pill tm-module-pill tm-module-pill--secondary">
              {secondaryLabel}
            </span>
          </span>
        </div>
        <div className="tm-chat-header-end">
          <AssistantLibToolbar
            activeView={panelView}
            shareDisabled={!activeLearningSession}
            onShareNote={() => {
              props.notes.createNoteFromMessage(
                activeLearningSession?.title ?? t('assistantLibPage.classroomNotes'),
                shareSummary(),
              )
              props.setActiveView('notes')
            }}
            onShareGroup={async () => {
              await navigator.clipboard.writeText(shareSummary())
              props.setStatusMessage?.(t('assistantLibPage.shareCopied'))
              props.setActiveView('group')
            }}
          />
        </div>
      </header>

      {error ? <div className="tm-error-bar">{error}</div> : null}

      {showRecords ? (
        <AssistantLibClassroomRecords
          sessions={activeLearningSession ? [activeLearningSession] : []}
          onOpenSession={(sessionId) => {
            void props.chat.selectSession(sessionId)
            setAssistantLibPanelView('agent')
          }}
        />
      ) : (
        <div className="tm-pm-agent-root">
          <AssistantLibChatPanel
            chat={props.chat}
            messageSettings={props.messageSettings}
            defaultModelId={props.defaultModelId}
            translationLanguages={props.translationLanguages}
            groupProxyReadOnly={props.groupProxyReadOnly}
            appSettings={props.appSettings}
            systemPaths={props.systemPaths}
            agentPrefillText={props.agentPrefillText}
            agentPrefillAttachments={props.agentPrefillAttachments}
            chatPrefillRevision={props.chatPrefillRevision}
            handleEditUserMessage={props.handleEditUserMessage}
            handlePrefillConsumed={props.handlePrefillConsumed}
            updateAppSettings={props.updateAppSettings}
            notes={props.notes}
          />
        </div>
      )}

      {ui.createCourseOpen && props.workspaceId ? (
        <AssistantLibCreateCourseDialog
          workspaceId={props.workspaceId}
          knowledgeBases={knowledgeBases}
          defaultLocalFolderPath={props.knowledgeFolder.path}
          busy={busy || submittingCourse}
          onClose={closeAssistantLibCreateCourse}
          onStart={handleStart}
        />
      ) : null}

      {ui.settingsOpen && props.workspaceId ? (
        <AssistantLibSettingsDialog
          workspaceId={props.workspaceId}
          sessions={learningSessions}
          activeSessionId={props.chat.activeSessionId}
          knowledgeBases={knowledgeBases}
          defaultLocalFolderPath={props.knowledgeFolder.path}
          onClose={closeAssistantLibSettings}
          onSaved={props.handleReloadAssistants}
          onKnowledgeBasesChanged={reloadKnowledgeBases}
          onStatusMessage={props.setStatusMessage}
          onDeleteSession={(sessionId) => props.chat.deleteSession(sessionId)}
        />
      ) : null}
    </main>
  )
}

export default AssistantLibPage
