import { useEffect, useMemo, useState } from 'react'
import type { Assistant, Session } from '@toolman/shared'
import { ConfirmDialog } from '../ConfirmDialog'
import { IconChevronRight, IconPlus, IconTopic } from '../icons'
import { SidebarRenameInput } from '../../features/notes/SidebarRenameInput'
import { isGroupProxyAssistant, resolveGroupProxyAssistantDisplayName } from '../../features/group/group-agent-utils'
import { useI18n } from '../../i18n/useI18n'
import { translateAssistantName, translateSessionTitle } from '../../i18n/system-labels'

interface Props {
  assistants: Assistant[]
  sessions: Session[]
  activeSessionId: string | null
  sessionsLoading?: boolean
  onSelectSession: (id: string) => void
  onCreateSession: (assistantId?: string) => void
  onRenameSession: (id: string, title: string) => void
  onDeleteSession: (id: string) => void
  onDeleteAssistant: (id: string) => void
  onAddAssistant: () => void
}

function resolveAssistantSidebarName(assistant: Assistant, t: ReturnType<typeof useI18n>['t']): string {
  if (isGroupProxyAssistant(assistant)) {
    return resolveGroupProxyAssistantDisplayName(assistant)
  }
  return translateAssistantName(assistant.name, t)
}

function normalizeSessionTitle(next: string, fallback: string): string {
  const trimmed = next.trim()
  return trimmed || fallback
}

function groupSessions(sessions: Session[], assistants: Assistant[]) {
  const map = new Map<string, Session[]>()
  for (const assistant of assistants) {
    map.set(assistant.id, [])
  }
  const unassigned: Session[] = []

  for (const session of sessions) {
    if (session.assistantId && map.has(session.assistantId)) {
      map.get(session.assistantId)!.push(session)
    } else {
      unassigned.push(session)
    }
  }

  return { map, unassigned }
}

export function MiddleSidebar({
  assistants,
  sessions,
  activeSessionId,
  sessionsLoading,
  onSelectSession,
  onCreateSession,
  onRenameSession,
  onDeleteSession,
  onDeleteAssistant,
  onAddAssistant,
}: Props) {
  const { t } = useI18n()
  const { map, unassigned } = useMemo(
    () => groupSessions(sessions, assistants),
    [sessions, assistants],
  )

  const activeAssistantId = useMemo(() => {
    if (!activeSessionId) return null
    return sessions.find((s) => s.id === activeSessionId)?.assistantId ?? null
  }, [activeSessionId, sessions])

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [renameSessionId, setRenameSessionId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Session | null>(null)
  const [deleteAssistantTarget, setDeleteAssistantTarget] = useState<Assistant | null>(null)

  useEffect(() => {
    if (!activeAssistantId) return
    setExpanded((prev) => {
      if (prev.has(activeAssistantId)) return prev
      const next = new Set(prev)
      next.add(activeAssistantId)
      return next
    })
  }, [activeAssistantId])

  const toggleExpanded = (assistantId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(assistantId)) next.delete(assistantId)
      else next.add(assistantId)
      return next
    })
  }

  const renderSession = (session: Session) => {
    const isActive = activeSessionId === session.id
    const isRenaming = renameSessionId === session.id
    const displayTitle = translateSessionTitle(session.title, t)

    if (isRenaming) {
      return (
        <SidebarRenameInput
          key={session.id}
          value={session.title}
          className="tm-sidebar-rename-input tm-sidebar-rename-input--note"
          onCommit={(next) => {
            onRenameSession(session.id, normalizeSessionTitle(next, session.title))
            setRenameSessionId(null)
          }}
          onCancel={() => setRenameSessionId(null)}
        />
      )
    }

    return (
      <button
        key={session.id}
        type="button"
        className={[
          'tm-session-item',
          'tm-session-item--with-icon',
          isActive ? 'tm-session-item--active' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={() => onSelectSession(session.id)}
        onDoubleClick={(event) => {
          event.preventDefault()
          setRenameSessionId(session.id)
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          setDeleteTarget(session)
        }}
        title={displayTitle}
      >
        <span className="tm-session-item-icon" aria-hidden="true">
          <IconTopic size={14} />
        </span>
        <span className="tm-session-item-label">{displayTitle}</span>
      </button>
    )
  }

  return (
    <aside className="tm-sidebar">
      <div className="tm-sidebar-content">
        <button type="button" className="tm-sidebar-add" onClick={onAddAssistant}>
          <IconPlus />
          {t('sidebar.agent.addAssistant')}
        </button>

        <div className="tm-sidebar-list">
          {sessionsLoading && assistants.length === 0 && (
            <div className="tm-empty">{t('common.loading')}</div>
          )}
          {!sessionsLoading && assistants.length === 0 && (
            <div className="tm-empty">{t('sidebar.agent.emptyNoAssistant')}</div>
          )}

          {assistants.map((assistant) => {
            const assistantSessions = map.get(assistant.id) ?? []
            const isOpen = expanded.has(assistant.id)
            const isActive = assistant.id === activeAssistantId

            return (
              <div key={assistant.id} className="tm-assistant-group">
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
                    title={isOpen ? t('sidebar.agent.collapseHistory') : t('sidebar.agent.expandHistory')}
                    onClick={() => toggleExpanded(assistant.id)}
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
                    onClick={() => toggleExpanded(assistant.id)}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      if (!assistant.isBuiltin) {
                        setDeleteAssistantTarget(assistant)
                      }
                    }}
                  >
                    {resolveAssistantSidebarName(assistant, t)}
                  </button>
                  <div className="tm-assistant-actions">
                    {!isGroupProxyAssistant(assistant) ? (
                      <button
                        type="button"
                        className="tm-assistant-action-btn"
                        title={t('sidebar.agent.newTopic')}
                        onClick={() => onCreateSession(assistant.id)}
                      >
                        <IconPlus size={14} />
                      </button>
                    ) : (
                      <div className="tm-assistant-actions tm-assistant-actions--placeholder" aria-hidden="true" />
                    )}
                  </div>
                </div>

                {isOpen &&
                  (assistantSessions.length === 0 ? (
                    <div className="tm-session-empty">{t('sidebar.agent.emptyNoTopics')}</div>
                  ) : (
                    assistantSessions.map(renderSession)
                  ))}
              </div>
            )
          })}

          {unassigned.length > 0 && (
            <div className="tm-assistant-group">
              <div className="tm-assistant-row tm-assistant-row--open">
                <span className="tm-assistant-expand tm-assistant-expand--placeholder" />
                <span className="tm-assistant-name tm-assistant-name--static">{t('sidebar.agent.otherTopics')}</span>
                <div className="tm-assistant-actions tm-assistant-actions--placeholder" aria-hidden="true" />
              </div>
              {unassigned.map(renderSession)}
            </div>
          )}
        </div>
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title={t('sidebar.agent.deleteTopicTitle')}
          message={t('sidebar.agent.deleteTopicMessage', {
            title: translateSessionTitle(deleteTarget.title, t),
          })}
          confirmLabel={t('common.delete')}
          cancelLabel={t('common.cancel')}
          danger
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => {
            onDeleteSession(deleteTarget.id)
            setDeleteTarget(null)
          }}
        />
      )}

      {deleteAssistantTarget && (
        <ConfirmDialog
          title={t('sidebar.agent.deleteAssistantTitle')}
          message={
            isGroupProxyAssistant(deleteAssistantTarget)
              ? t('sidebar.agent.deleteAssistantGroupMessage', { name: deleteAssistantTarget.name })
              : t('sidebar.agent.deleteAssistantMessage', { name: deleteAssistantTarget.name })
          }
          confirmLabel={t('common.delete')}
          cancelLabel={t('common.cancel')}
          danger
          onCancel={() => setDeleteAssistantTarget(null)}
          onConfirm={() => {
            onDeleteAssistant(deleteAssistantTarget.id)
            setDeleteAssistantTarget(null)
          }}
        />
      )}
    </aside>
  )
}
