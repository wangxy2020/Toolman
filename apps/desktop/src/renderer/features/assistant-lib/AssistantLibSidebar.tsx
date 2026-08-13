import { useEffect, useMemo, useRef, useState } from 'react'
import {
  findAssistantLibGuideCourseSession,
  isAssistantLibGuideCourseSession,
  isSyllabusChapterLocked,
  looksLikeAssistantLibDefaultClassroom,
  looksLikeAssistantLibGuideCourse,
  parseAssistantLibSessionMeta,
  parseCourseSyllabus,
  type Session,
} from '@toolman/shared'
import { IconChevronRight, IconPlus, IconTopic } from '../../components/icons'
import { useI18n } from '../../i18n/useI18n'
import { setAssistantLibPanelView } from './assistant-lib-panel-view'
import { openAssistantLibCreateCourse } from './assistant-lib-ui'
import {
  resolveCourseKbId,
  resolveLearningChapterId,
  useAssistantLibCourseCatalog,
} from './useAssistantLibCourseCatalog'

type Props = {
  workspaceId: string | null
  sessions: Session[]
  activeSessionId: string | null
  onSelectSession: (id: string) => void
}

function resolveCourseLabel(session: Session, defaultLabel: string, guideLabel: string): string {
  if (looksLikeAssistantLibDefaultClassroom(session)) return defaultLabel
  const meta = parseAssistantLibSessionMeta(session.metadata)
  const custom = meta?.courseName?.trim() || session.title?.trim()
  if (looksLikeAssistantLibGuideCourse(session)) return custom || guideLabel
  return custom || defaultLabel
}

export function AssistantLibSidebar({
  workspaceId,
  sessions,
  activeSessionId,
  onSelectSession,
}: Props) {
  const { t } = useI18n()

  const orderedSessions = useMemo(() => {
    const visible = sessions.filter(
      (session) => !looksLikeAssistantLibDefaultClassroom(session),
    )
    const assistantId = visible.find((session) => session.assistantId)?.assistantId ?? null
    const guideKeeper = assistantId
      ? findAssistantLibGuideCourseSession(visible, assistantId)
      : (visible.find((session) => looksLikeAssistantLibGuideCourse(session)) ?? null)
    const others = visible.filter(
      (session) =>
        session.id !== guideKeeper?.id && !looksLikeAssistantLibGuideCourse(session),
    )
    return [...(guideKeeper ? [guideKeeper] : []), ...others]
  }, [sessions])

  const { chaptersForSession, isLoadingSession, errorForSession } = useAssistantLibCourseCatalog(
    workspaceId,
    orderedSessions,
  )

  /** Manual chapter picks; cleared when selecting the course row so highlight follows learning state. */
  const [chapterOverrideBySession, setChapterOverrideBySession] = useState<Record<string, string>>(
    {},
  )
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const seenBuiltinExpandRef = useRef<Set<string>>(new Set())
  const seenKbBindingRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    setAssistantLibPanelView('agent')
  }, [])

  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev)
      for (const session of orderedSessions) {
        const isBuiltin = isAssistantLibGuideCourseSession(session.metadata)
        if (isBuiltin && !seenBuiltinExpandRef.current.has(session.id)) {
          seenBuiltinExpandRef.current.add(session.id)
          next.add(session.id)
        }
        if (session.id === activeSessionId) {
          next.add(session.id)
        }
        const kbId = resolveCourseKbId(session)
        if (!kbId) continue
        const bindingKey = `${session.id}:${kbId}`
        if (!seenKbBindingRef.current.has(bindingKey)) {
          seenKbBindingRef.current.add(bindingKey)
          next.add(session.id)
        }
      }
      return next
    })
  }, [activeSessionId, orderedSessions])

  const toggleExpanded = (sessionId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(sessionId)) next.delete(sessionId)
      else next.add(sessionId)
      return next
    })
  }

  return (
    <aside className="tm-sidebar tm-alib-sidebar">
      <div className="tm-sidebar-content">
        <button
          type="button"
          className="tm-sidebar-add"
          onClick={() => openAssistantLibCreateCourse()}
        >
          <IconPlus />
          {t('assistantLibPage.addCourse')}
        </button>

        <div className="tm-sidebar-list">
          {orderedSessions.length === 0 ? (
            <div className="tm-alib-sidebar-empty">{t('assistantLibPage.emptySessions')}</div>
          ) : (
            orderedSessions.map((session) => {
              const isActive = session.id === activeSessionId
              const isOpen = expanded.has(session.id)
              const label = resolveCourseLabel(
                session,
                t('assistantLibPage.defaultCourse'),
                t('assistantLibPage.guideCourse'),
              )
              const syllabus = parseCourseSyllabus(
                parseAssistantLibSessionMeta(session.metadata)?.syllabus,
              )
              const catalogChapters = chaptersForSession(session)
              const chapters =
                syllabus && syllabus.chapters.length > 0
                  ? syllabus.chapters.map((chapter) => ({
                      id: chapter.id,
                      title: chapter.title,
                      label: chapter.title,
                      status: chapter.status,
                    }))
                  : catalogChapters.map((chapter) => ({
                      ...chapter,
                      status: undefined as string | undefined,
                    }))
              const loading = isLoadingSession(session)
              const loadError = errorForSession(session)
              const selectedChapterId =
                chapterOverrideBySession[session.id] ??
                resolveLearningChapterId(session, chapters)

              return (
                <div key={session.id} className="tm-assistant-group">
                  <div
                    className={[
                      'tm-assistant-row',
                      isOpen ? 'tm-assistant-row--open' : '',
                      isActive ? 'tm-assistant-row--active' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <button
                      type="button"
                      className="tm-assistant-expand"
                      title={
                        isOpen
                          ? t('sidebar.agent.collapseHistory')
                          : t('sidebar.agent.expandHistory')
                      }
                      aria-expanded={isOpen}
                      onClick={() => toggleExpanded(session.id)}
                    >
                      <IconChevronRight open={isOpen} />
                    </button>
                    <button
                      type="button"
                      className={[
                        'tm-assistant-name',
                        isActive ? 'tm-assistant-name--active' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      title={label}
                      onClick={() => {
                        setAssistantLibPanelView('agent')
                        setChapterOverrideBySession((prev) => {
                          if (!(session.id in prev)) return prev
                          const next = { ...prev }
                          delete next[session.id]
                          return next
                        })
                        onSelectSession(session.id)
                        setExpanded((prev) => new Set(prev).add(session.id))
                      }}
                    >
                      {label}
                    </button>
                    <div
                      className="tm-assistant-actions tm-assistant-actions--placeholder"
                      aria-hidden
                    />
                  </div>

                  {isOpen ? (
                    loading ? (
                      <div className="tm-session-empty">{t('common.loading')}</div>
                    ) : loadError ? (
                      <div className="tm-session-empty">{loadError}</div>
                    ) : chapters.length === 0 ? (
                      <div className="tm-session-empty">
                        {t('assistantLibPage.emptyCatalogNoKb')}
                      </div>
                    ) : (
                      chapters.map((chapter) => {
                        const chapterActive =
                          isActive && selectedChapterId === chapter.id
                        const locked = Boolean(
                          syllabus && isSyllabusChapterLocked(syllabus, chapter.id),
                        )
                        const level = 'level' in chapter ? (chapter.level ?? 1) : 1
                        return (
                          <button
                            key={chapter.id}
                            type="button"
                            disabled={locked}
                            className={[
                              'tm-session-item',
                              'tm-session-item--with-icon',
                              level > 1 ? 'tm-session-item--nested' : '',
                              chapterActive ? 'tm-session-item--active' : '',
                              locked ? 'tm-session-item--locked' : '',
                              chapter.status === 'passed' ? 'tm-session-item--passed' : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                            style={level > 1 ? { paddingLeft: `${18 + (level - 1) * 12}px` } : undefined}
                            title={
                              locked
                                ? t('assistantLibPage.records.chapterLocked')
                                : chapter.title
                            }
                            onClick={() => {
                              if (locked) return
                              setAssistantLibPanelView('agent')
                              setChapterOverrideBySession((prev) => ({
                                ...prev,
                                [session.id]: chapter.id,
                              }))
                              onSelectSession(session.id)
                            }}
                          >
                            <span className="tm-session-item-icon" aria-hidden="true">
                              <IconTopic size={14} />
                            </span>
                            <span className="tm-session-item-label">{chapter.label}</span>
                          </button>
                        )
                      })
                    )
                  ) : null}
                </div>
              )
            })
          )}
        </div>
      </div>
    </aside>
  )
}
