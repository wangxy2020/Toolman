import { useEffect, useMemo, useRef, useState } from 'react'
import {
  isAssistantLibDefaultClassroomSession,
  parseAssistantLibSessionMeta,
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

function resolveCourseLabel(session: Session, defaultLabel: string): string {
  if (isAssistantLibDefaultClassroomSession(session.metadata)) return defaultLabel
  const meta = parseAssistantLibSessionMeta(session.metadata)
  return meta?.courseName?.trim() || session.title || defaultLabel
}

export function AssistantLibSidebar({
  workspaceId,
  sessions,
  activeSessionId,
  onSelectSession,
}: Props) {
  const { t } = useI18n()

  const orderedSessions = useMemo(() => {
    const defaultClassroom =
      sessions.find((session) => isAssistantLibDefaultClassroomSession(session.metadata)) ?? null
    const others = sessions.filter((session) => session.id !== defaultClassroom?.id)
    return defaultClassroom ? [defaultClassroom, ...others] : others
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
  const defaultExpandedRef = useRef(false)
  const seenKbBindingRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    setAssistantLibPanelView('agent')
  }, [])

  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev)
      for (const session of orderedSessions) {
        if (
          !defaultExpandedRef.current &&
          isAssistantLibDefaultClassroomSession(session.metadata)
        ) {
          defaultExpandedRef.current = true
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
              const label = resolveCourseLabel(session, t('assistantLibPage.defaultCourse'))
              const hasKb = Boolean(resolveCourseKbId(session))
              const chapters = chaptersForSession(session)
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
                    ) : !hasKb ? (
                      <div className="tm-session-empty">
                        {t('assistantLibPage.emptyCatalogNoKb')}
                      </div>
                    ) : chapters.length === 0 ? (
                      <div className="tm-session-empty">
                        {t('assistantLibPage.emptyCatalogNoChapters')}
                      </div>
                    ) : (
                      chapters.map((chapter) => {
                        const chapterActive =
                          isActive && selectedChapterId === chapter.id
                        const level = chapter.level ?? 1
                        return (
                          <button
                            key={chapter.id}
                            type="button"
                            className={[
                              'tm-session-item',
                              'tm-session-item--with-icon',
                              level > 1 ? 'tm-session-item--nested' : '',
                              chapterActive ? 'tm-session-item--active' : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                            style={level > 1 ? { paddingLeft: `${18 + (level - 1) * 12}px` } : undefined}
                            title={chapter.title}
                            onClick={() => {
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
