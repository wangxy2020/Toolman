import { useCallback } from 'react'
import {
  IpcChannel,
  appendClassroomStudyRecord,
  assistantLibSessionMetadataPatch,
  buildStartClassUserMessage,
  endOpenClassroomStudyRecords,
  parseAssistantLibSessionMeta,
  parseCourseSyllabus,
  parseSocraticState,
  currentSyllabusChapter,
} from '@toolman/shared'
import { safeInvoke } from '../../../lib/ipc-client'
import { setAssistantLibPanelView } from '../assistant-lib-panel-view'
import type { AssistantLibPageProps } from '../assistant-lib-page-types'

export function useAssistantLibPageClass(options: {
  props: AssistantLibPageProps
  activeLearningSession: AssistantLibPageProps['chat']['sessions'][number] | null | undefined
  t: (key: string) => string
  classLive: boolean
}) {
  const { props, activeLearningSession, t, classLive } = options

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
            meta.courseName?.trim() || session.title || t('assistantLibPage.defaultCourse'),
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

  const handleToggleClass = useCallback(() => {
    if (classLive) return handleStopClass()
    return handleStartClass()
  }, [classLive, handleStartClass, handleStopClass])

  return { handleToggleClass }
}
