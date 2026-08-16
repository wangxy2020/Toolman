import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  IpcChannel,
  isAssistantLibGuideCourseSession,
  isClassroomLive,
  parseAssistantLibSessionMeta,
  type KnowledgeBase,
} from '@toolman/shared'
import { useI18n } from '../../../i18n/useI18n'
import { safeInvoke } from '../../../lib/ipc-client'
import { useAutoPublishMobileSync } from '../../mobile-sync/useAutoPublishMobileSync'
import type { AssistantLibPageProps } from '../assistant-lib-page-types'
import type { AssistantLibCreateCourseInput } from '../assistant-lib-create-course-utils'
import {
  setAssistantLibPanelView,
  useAssistantLibPanelView,
} from '../assistant-lib-panel-view'
import {
  closeAssistantLibCreateCourse,
  closeAssistantLibSettings,
  useAssistantLibUiState,
} from '../assistant-lib-ui'
import {
  buildShareSummary,
  resolveActiveLearningSession,
  resolveAssistantLibSecondaryLabel,
} from '../assistant-lib-page-utils'
import { createLocalTextbookKnowledgeBase } from '../create-textbook-kb'
import { useAssistantLibBootstrap } from './useAssistantLibBootstrap'
import { useAssistantLibPageClass } from './useAssistantLibPageClass'
import { useAssistantLibSessions } from './useAssistantLibSessions'

export function useAssistantLibPage(props: AssistantLibPageProps) {
  const { t } = useI18n()
  useAutoPublishMobileSync('classroom')
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

  const activeLearningSession = useMemo(
    () =>
      resolveActiveLearningSession(
        learningSessions,
        activeSessionId,
        activeAssistantId,
        sharedAssistant?.id ?? null,
      ),
    [learningSessions, activeAssistantId, activeSessionId, sharedAssistant],
  )

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
      if (session && isAssistantLibGuideCourseSession(session.metadata) && sharedAssistant) {
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

  const classLive = isClassroomLive(
    parseAssistantLibSessionMeta(activeLearningSession?.metadata)?.studyRecords,
  )

  const { handleToggleClass } = useAssistantLibPageClass({
    props,
    activeLearningSession,
    t,
    classLive,
  })

  const showRecords = panelView === 'records'
  const secondaryLabel = resolveAssistantLibSecondaryLabel(
    activeLearningSession,
    {
      records: t('assistantLibPage.records.title'),
      defaultCourse: t('assistantLibPage.defaultCourse'),
      guideCourse: t('assistantLibPage.guideCourse'),
    },
    showRecords,
  )

  return {
    t,
    props,
    ui,
    panelView,
    knowledgeBases,
    submittingCourse,
    learningSessions,
    busy,
    error,
    activeLearningSession,
    reloadKnowledgeBases,
    handleDeleteLearningSession,
    handleStart,
    shareSummary,
    handleToggleClass,
    classLive,
    showRecords,
    secondaryLabel,
    closeAssistantLibCreateCourse,
    closeAssistantLibSettings,
  }
}
