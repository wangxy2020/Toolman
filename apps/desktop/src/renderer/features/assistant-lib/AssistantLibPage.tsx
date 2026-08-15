import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  IpcChannel,
  appendClassroomStudyRecord,
  assistantLibSessionMetadataPatch,
  buildStartClassUserMessage,
  currentSyllabusChapter,
  endOpenClassroomStudyRecords,
  isAssistantLibGuideCourseSession,
  isClassroomLive,
  looksLikeAssistantLibDefaultClassroom,
  looksLikeAssistantLibGuideCourse,
  parseAssistantLibSessionMeta,
  parseCourseSyllabus,
  parseSocraticState,
  resolveOngoingClassroomFocus,
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
import { safeInvoke } from '../../lib/ipc-client'
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
  const { busy, error, startCourse, ensureClassroom } = useAssistantLibBootstrap({
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
      const linked = await ensureClassroom()
      if (cancelled || !linked?.session) return
      const activeBelongsToLib = activeAssistantId === linked.assistant.id
      const activeWasRemoved = Boolean(
        activeSessionId && linked.removedDefaultIds.includes(activeSessionId),
      )
      if (!activeBelongsToLib || activeWasRemoved) {
        await selectSession(linked.session.id)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [ensureClassroom, activeAssistantId, activeSessionId, selectSession])

  const activeLearningSession = useMemo(() => {
    if (activeSessionId && sharedAssistant && activeAssistantId === sharedAssistant.id) {
      const current = learningSessions.find((item) => item.id === activeSessionId)
      if (current && !looksLikeAssistantLibDefaultClassroom(current)) return current
    }
    const ongoingId = resolveOngoingClassroomFocus(
      learningSessions
        .filter((item) => !looksLikeAssistantLibDefaultClassroom(item))
        .map((item) => {
          const meta = parseAssistantLibSessionMeta(item.metadata)
          return {
            id: item.id,
            studyRecords: meta?.studyRecords,
            syllabus: parseCourseSyllabus(meta?.syllabus),
          }
        }),
    )?.courseId
    return (
      learningSessions.find((item) => item.id === ongoingId) ??
      learningSessions.find((item) => isAssistantLibGuideCourseSession(item.metadata)) ??
      learningSessions.find((item) => !looksLikeAssistantLibDefaultClassroom(item)) ??
      null
    )
  }, [learningSessions, activeAssistantId, activeSessionId, sharedAssistant])

  useEffect(() => {
    setAssistantLibPanelView('agent')
  }, [])

  useEffect(() => {
    return window.api.subscribe(IpcChannel.AssistantLibSyllabusStream, () => {
      void props.chat.loadSessions()
    })
  }, [props.chat])

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

  const handleDeleteLearningSession = useCallback(
    async (sessionId: string) => {
      const session = learningSessions.find((item) => item.id === sessionId)
      if (
        session &&
        isAssistantLibGuideCourseSession(session.metadata) &&
        sharedAssistant
      ) {
        await window.api.invoke(IpcChannel.AssistantUpdate, {
          id: sharedAssistant.id,
          parameters: {
            ...sharedAssistant.parameters,
            assistantLibGuideDismissed: true,
          },
        })
        await props.handleReloadAssistants()
      }
      await props.chat.deleteSession(sessionId)
    },
    [learningSessions, props, sharedAssistant],
  )

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
        if (kbIds?.length && props.defaultModelId) {
          const generated = await safeInvoke(IpcChannel.AssistantLibSyllabusGenerate, {
            workspaceId: props.workspaceId,
            sessionId: result.session.id,
            modelId: props.defaultModelId,
          })
          if (!generated.ok) {
            props.setStatusMessage?.(generated.error.message)
          }
        }
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

  const handleStartClass = useCallback(async () => {
    const session = activeLearningSession
    if (!session) {
      props.setStatusMessage?.(t('assistantLibPage.selectPresetHint'))
      return
    }
    if (props.chat.sending) return
    const meta = parseAssistantLibSessionMeta(session.metadata)
    if (!meta) return
    const syllabus = parseCourseSyllabus(meta.syllabus)
    const chapter = syllabus ? currentSyllabusChapter(syllabus) : null
    const state = parseSocraticState(session.metadata)
    const studyRecords = appendClassroomStudyRecord(meta.studyRecords, {
      chapterId: chapter?.id,
      chapterTitle: chapter?.title,
    })
    const metadata = assistantLibSessionMetadataPatch(session.metadata, {
      ...meta,
      studyRecords,
    })
    const updated = await safeInvoke(IpcChannel.SessionUpdate, {
      id: session.id,
      metadata,
    })
    if (!updated.ok) {
      props.setStatusMessage?.(updated.error.message)
      return
    }
    await props.chat.loadSessions()
    if (props.chat.activeSessionId !== session.id) {
      await props.chat.selectSession(session.id)
    }
    setAssistantLibPanelView('agent')
    await props.chat.sendMessage([
      {
        type: 'text',
        text: buildStartClassUserMessage({
          courseName:
            meta.courseName?.trim() ||
            session.title ||
            t('assistantLibPage.defaultCourse'),
          syllabus: syllabus ?? undefined,
          records: studyRecords,
          state,
        }),
      },
    ])
  }, [activeLearningSession, props, t])

  const handleStopClass = useCallback(async () => {
    const session = activeLearningSession
    if (!session) return
    if (props.chat.sending) {
      await props.chat.abortStreaming()
    }
    const meta = parseAssistantLibSessionMeta(session.metadata)
    if (!meta) return
    const studyRecords = endOpenClassroomStudyRecords(meta.studyRecords)
    const metadata = assistantLibSessionMetadataPatch(session.metadata, {
      ...meta,
      studyRecords,
    })
    const updated = await safeInvoke(IpcChannel.SessionUpdate, {
      id: session.id,
      metadata,
    })
    if (!updated.ok) {
      props.setStatusMessage?.(updated.error.message)
      return
    }
    await props.chat.loadSessions()
    setAssistantLibPanelView('agent')
  }, [activeLearningSession, props])

  const classLive = isClassroomLive(
    parseAssistantLibSessionMeta(activeLearningSession?.metadata)?.studyRecords,
  )

  const handleToggleClass = useCallback(() => {
    if (classLive) return handleStopClass()
    return handleStartClass()
  }, [classLive, handleStartClass, handleStopClass])

  const showRecords = panelView === 'records'
  const secondaryLabel = showRecords
    ? t('assistantLibPage.records.title')
    : activeLearningSession
      ? looksLikeAssistantLibDefaultClassroom(activeLearningSession)
        ? t('assistantLibPage.defaultCourse')
        : looksLikeAssistantLibGuideCourse(activeLearningSession)
          ? t('assistantLibPage.guideCourse')
          : (parseAssistantLibSessionMeta(activeLearningSession.metadata)?.courseName?.trim() ||
            activeLearningSession.title)
      : t('assistantLibPage.defaultCourse')

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
            classLive={classLive}
            classToggleDisabled={!activeLearningSession}
            onToggleClass={() => void handleToggleClass()}
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
          session={activeLearningSession}
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
          onDeleteSession={handleDeleteLearningSession}
          defaultModelId={props.defaultModelId}
        />
      ) : null}
    </main>
  )
}

export default AssistantLibPage
