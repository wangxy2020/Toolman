import { useEffect, useMemo, useRef } from 'react'
import {
  applySocraticStateFromAssistantText,
  applySyllabusLearningProgress,
  assistantLibSessionMetadataPatch,
  formatSyllabusMarkdown,
  IpcChannel,
  isAssistantLibAssistantName,
  parseAssistantLibSessionMeta,
  parseSocraticState,
  touchLatestClassroomStudyRecord,
  type CourseSyllabus,
  type SocraticState,
} from '@toolman/shared'
import { ChatComposer } from '../chat/ChatComposer'
import { getMessageText, getUserFacingMessageText } from '../chat/message-utils'
import type { ChatPageState } from '../chat/useChatPage'
import { useI18n } from '../../i18n/useI18n'
import { isClassroomOwnedSession } from './classroom-session-binding'

function socraticStateSignature(state: SocraticState): string {
  return JSON.stringify({
    topic: state.topic ?? '',
    mastered: state.mastered,
    misconceptions: state.misconceptions,
    stuckPoints: state.stuckPoints,
    confirmedClaims: state.confirmedClaims,
    openAssumptions: state.openAssumptions,
    pathIndex: state.pathIndex ?? 0,
    pathNodes: state.pathNodes,
    chapterPassed: Boolean(state.chapterPassed),
    currentChapterId: state.currentChapterId ?? '',
  })
}

function syllabusSignature(syllabus: CourseSyllabus | null | undefined): string {
  if (!syllabus) return ''
  return JSON.stringify({
    generation: syllabus.generation,
    generationError: syllabus.generationError ?? '',
    generatedCount: syllabus.generatedCount,
    totalHours: syllabus.totalHours ?? 0,
    chapters: syllabus.chapters.map((chapter) => ({
      id: chapter.id,
      title: chapter.title,
      hours: chapter.hours ?? 0,
      lessonPlan: chapter.lessonPlan ?? '',
      assessmentQuestions: chapter.assessmentQuestions,
      status: chapter.status,
    })),
  })
}

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

  const classroomAssistantId =
    chat.assistants.find((item) => isAssistantLibAssistantName(item.name))?.id ?? null
  const onClassroomSession = isClassroomOwnedSession(chat.activeSession, classroomAssistantId)

  const activeAssistant = useMemo(() => {
    const assistantId = chat.activeSession?.assistantId
    if (!assistantId) return null
    return chat.assistants.find((item) => item.id === assistantId) ?? null
  }, [chat.activeSession?.assistantId, chat.assistants])

  useEffect(() => {
    if (!onClassroomSession) return
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
  }, [
    activeAssistant,
    onClassroomSession,
    props.appSettings.kbEnabledByAssistantId,
    updateAppSettings,
  ])

  const latestAssistant = useMemo(() => {
    return [...chat.messages].reverse().find((message) => message.role === 'assistant') ?? null
  }, [chat.messages])

  const understanding = useMemo(() => {
    return parseSocraticState(chat.activeSession?.metadata)
  }, [chat.activeSession?.metadata])
  const persistInFlight = useRef(false)

  useEffect(() => {
    const session = chat.activeSession
    if (!onClassroomSession || !session || !latestAssistant || latestAssistant.status !== 'completed') {
      return
    }
    if (persistInFlight.current) return
    // Keep machine fences in the raw message for parsing; do not surface them in chat UI.
    const text = getMessageText(latestAssistant)
    const parsedState = applySocraticStateFromAssistantText(understanding, text)
    const meta = parseAssistantLibSessionMeta(session.metadata)
    const progressed = applySyllabusLearningProgress(meta?.syllabus, parsedState)
    const nextState = progressed.state
    const nextSyllabus = progressed.syllabus
    const nextStudyRecords = touchLatestClassroomStudyRecord(meta?.studyRecords, {
      mastered: nextState.mastered,
      stuckPoints: nextState.stuckPoints,
      qaCount: chat.messages.filter((item) => item.role === 'user').length,
    })
    const syllabusChanged = syllabusSignature(meta?.syllabus) !== syllabusSignature(nextSyllabus)
    const stateChanged = socraticStateSignature(understanding) !== socraticStateSignature(nextState)
    const recordsChanged =
      JSON.stringify(meta?.studyRecords ?? []) !== JSON.stringify(nextStudyRecords)
    if (!stateChanged && !syllabusChanged && !recordsChanged) return
    persistInFlight.current = true
    const metadata = meta
      ? assistantLibSessionMetadataPatch(session.metadata, {
          ...meta,
          syllabus: nextSyllabus,
          lessonPlan: formatSyllabusMarkdown(nextSyllabus) || meta.lessonPlan,
          studyRecords: nextStudyRecords,
        })
      : session.metadata
    void window.api
      .invoke(IpcChannel.SessionUpdate, {
        id: session.id,
        metadata: {
          ...metadata,
          socraticState: nextState,
        },
      })
      .then(() => chat.loadSessions())
      .finally(() => {
        persistInFlight.current = false
      })
  }, [
    chat.activeSession,
    chat.loadSessions,
    latestAssistant,
    onClassroomSession,
    understanding,
  ])

  // Always show the agent chat pane (blank when no course), matching 自动化 with no tasks.
  // Foreign sessions are rebound by ensureActiveClassroomChatSession on page mount.
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
        activeAssistantName={
          onClassroomSession
            ? (activeAssistant?.name ?? t('assistantLibPage.title'))
            : t('assistantLibPage.title')
        }
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
        onCreateSession={() => void chat.createSession(classroomAssistantId ?? undefined)}
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
