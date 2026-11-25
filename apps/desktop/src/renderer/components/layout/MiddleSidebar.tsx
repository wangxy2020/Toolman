import { useEffect, useMemo, useState } from 'react'
import type { Assistant, Session } from '@toolman/shared'
import {
  isAssistantLibAssistantName,
  isAssistantLibSession,
  isAutomationAssistantName,
  PROJECT_MANAGEMENT_ASSISTANT_NAME,
  sortProjectManagementSessionsByMenuOrder,
} from '@toolman/shared'
import { ConfirmDialog } from '../ConfirmDialog'
import { IconChevronRight, IconPlus, IconTopic } from '../icons'
import { AgentSidebarContextMenu } from '../../features/chat/AgentSidebarContextMenu'
import { SidebarRenameInput } from '../../features/notes/SidebarRenameInput'
import { isGroupProxyAssistant, resolveGroupProxyAssistantDisplayName } from '../../features/group/group-agent-utils'
import {
  DEFAULT_SIDEBAR_MENU_ORDER,
  readProjectSidebarMenuPreferences,
} from '../../features/project-manager/projectSidebarMenuConfig'
import { useI18n } from '../../i18n/useI18n'
import { translateAssistantName, translateSessionTitle } from '../../i18n/system-labels'
import { useWorkflows } from '../../features/workflow/useWorkflows'

interface Props {
  assistants: Assistant[]
  sessions: Session[]
  activeSessionId: string | null
  sessionsLoading?: boolean
  onSelectSession: (id: string) => void
  /** Switch to this agent by selecting its latest topic (or creating one). */
  onSelectAssistant: (assistantId: string) => void
  onCreateSession: (assistantId?: string) => void
  onRenameSession: (id: string, title: string) => void
  onDeleteSession: (id: string) => void
  onRenameAssistant: (id: string, name: string) => void
  onDeleteAssistant: (id: string) => void
  onAddAssistant: () => void
}

function resolveAssistantSidebarName(assistant: Assistant, t: ReturnType<typeof useI18n>['t']): string {
  if (isGroupProxyAssistant(assistant)) {
    return resolveGroupProxyAssistantDisplayName(assistant)
  }
  if (isAutomationAssistantName(assistant.name)) {
    return t('modules.workflow.title')
  }
  return translateAssistantName(assistant.name, t)
}

function normalizeTitle(next: string, fallback: string): string {
  const trimmed = next.trim()
  return trimmed || fallback
}

function canRenameAssistant(assistant: Assistant): boolean {
  return !isGroupProxyAssistant(assistant) && !isAutomationAssistantName(assistant.name)
}

function canDeleteAssistant(assistant: Assistant): boolean {
  return !assistant.isBuiltin
}

function groupSessions(sessions: Session[], assistants: Assistant[]) {
  const map = new Map<string, Session[]>()
  for (const assistant of assistants) {
    map.set(assistant.id, [])
  }
  const hasClassroomAssistant = assistants.some((assistant) =>
    isAssistantLibAssistantName(assistant.name),
  )
  const unassigned: Session[] = []

  for (const session of sessions) {
    if (session.assistantId && map.has(session.assistantId)) {
      map.get(session.assistantId)!.push(session)
      continue
    }
    // Course / classroom topics with a stale assistantId belong under 课堂,
    // not「其他话题」— sessionsForAssistant already merges them there.
    if (hasClassroomAssistant && isAssistantLibSession(session.metadata)) {
      continue
    }
    unassigned.push(session)
  }

  return { map, unassigned }
}

function sessionsForAssistant(
  assistant: Assistant,
  assistantSessions: Session[],
  allSessions: Session[],
  linkedAutomationSessionIds: ReadonlySet<string> | null,
): Session[] {
  if (isAutomationAssistantName(assistant.name)) {
    if (!linkedAutomationSessionIds) return []
    return allSessions.filter((session) => linkedAutomationSessionIds.has(session.id))
  }
  // 课堂：课程话题 + 该智能体下的对话会话（上课消息常落在无课程 meta 的会话里）。
  if (isAssistantLibAssistantName(assistant.name)) {
    return allSessions
      .filter(
        (session) =>
          session.assistantId === assistant.id || isAssistantLibSession(session.metadata),
      )
      .sort((left, right) => right.updatedAt - left.updatedAt)
  }
  if (assistant.name !== PROJECT_MANAGEMENT_ASSISTANT_NAME) return assistantSessions
  const menuOrder = readProjectSidebarMenuPreferences().order
  const order = menuOrder.length > 0 ? menuOrder : DEFAULT_SIDEBAR_MENU_ORDER
  return sortProjectManagementSessionsByMenuOrder(assistantSessions, order)
}

export function MiddleSidebar({
  assistants,
  sessions,
  activeSessionId,
  sessionsLoading,
  onSelectSession,
  onSelectAssistant,
  onCreateSession,
  onRenameSession,
  onDeleteSession,
  onRenameAssistant,
  onDeleteAssistant,
  onAddAssistant,
}: Props) {
  const { t } = useI18n()
  const { items: workflowItems, loading: workflowsLoading } = useWorkflows()
  const linkedAutomationSessionIds = useMemo(() => {
    if (workflowsLoading && workflowItems.length === 0) return null
    const ids = new Set<string>()
    for (const item of workflowItems) {
      if (item.sessionId) ids.add(item.sessionId)
    }
    return ids
  }, [workflowItems, workflowsLoading])
  const { map, unassigned } = useMemo(
    () => groupSessions(sessions, assistants),
    [sessions, assistants],
  )

  const activeAssistantId = useMemo(() => {
    if (!activeSessionId) return null
    const active = sessions.find((s) => s.id === activeSessionId) ?? null
    if (!active?.assistantId) return null
    // Highlight the visible「课堂」row even when the topic still points at a duplicate agent id.
    if (isAssistantLibSession(active.metadata)) {
      const classroom = assistants.find((item) => isAssistantLibAssistantName(item.name))
      if (classroom) return classroom.id
    }
    return active.assistantId
  }, [activeSessionId, assistants, sessions])

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [renameSessionId, setRenameSessionId] = useState<string | null>(null)
  const [renameAssistantId, setRenameAssistantId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Session | null>(null)
  const [deleteAssistantTarget, setDeleteAssistantTarget] = useState<Assistant | null>(null)
  const [sessionContextMenu, setSessionContextMenu] = useState<{
    x: number
    y: number
    session: Session
  } | null>(null)
  const [assistantContextMenu, setAssistantContextMenu] = useState<{
    x: number
    y: number
    assistant: Assistant
  } | null>(null)

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
            onRenameSession(session.id, normalizeTitle(next, session.title))
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
          setRenameAssistantId(null)
          setRenameSessionId(session.id)
        }}
        onContextMenu={(event) => {
          event.preventDefault()
          setAssistantContextMenu(null)
          setSessionContextMenu({
            x: event.clientX,
            y: event.clientY,
            session,
          })
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
            const assistantSessions = sessionsForAssistant(
              assistant,
              map.get(assistant.id) ?? [],
              sessions,
              linkedAutomationSessionIds,
            )
            const isOpen = expanded.has(assistant.id)
            const isActive = assistant.id === activeAssistantId
            const isRenamingAssistant = renameAssistantId === assistant.id
            const displayName = resolveAssistantSidebarName(assistant, t)

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
                  {isRenamingAssistant ? (
                    <SidebarRenameInput
                      value={assistant.name}
                      className="tm-sidebar-rename-input"
                      onCommit={(next) => {
                        onRenameAssistant(assistant.id, normalizeTitle(next, assistant.name))
                        setRenameAssistantId(null)
                      }}
                      onCancel={() => setRenameAssistantId(null)}
                    />
                  ) : (
                    <button
                      type="button"
                      className={[
                        'tm-assistant-name',
                        isActive ? 'tm-assistant-name--active' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => {
                        setExpanded((prev) => {
                          if (prev.has(assistant.id)) return prev
                          const next = new Set(prev)
                          next.add(assistant.id)
                          return next
                        })
                        onSelectAssistant(assistant.id)
                      }}
                      onDoubleClick={(event) => {
                        if (!canRenameAssistant(assistant)) return
                        event.preventDefault()
                        setRenameSessionId(null)
                        setRenameAssistantId(assistant.id)
                      }}
                      onContextMenu={(event) => {
                        event.preventDefault()
                        if (!canRenameAssistant(assistant) && !canDeleteAssistant(assistant)) return
                        setSessionContextMenu(null)
                        setAssistantContextMenu({
                          x: event.clientX,
                          y: event.clientY,
                          assistant,
                        })
                      }}
                    >
                      {displayName}
                    </button>
                  )}
                  <div className="tm-assistant-actions">
                    {!isGroupProxyAssistant(assistant) &&
                    !isAutomationAssistantName(assistant.name) &&
                    !isAssistantLibAssistantName(assistant.name) ? (
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

      {sessionContextMenu ? (
        <AgentSidebarContextMenu
          x={sessionContextMenu.x}
          y={sessionContextMenu.y}
          canRename
          canDelete
          onClose={() => setSessionContextMenu(null)}
          onRename={() => {
            setRenameAssistantId(null)
            setRenameSessionId(sessionContextMenu.session.id)
          }}
          onDelete={() => setDeleteTarget(sessionContextMenu.session)}
        />
      ) : null}

      {assistantContextMenu ? (
        <AgentSidebarContextMenu
          x={assistantContextMenu.x}
          y={assistantContextMenu.y}
          canRename={canRenameAssistant(assistantContextMenu.assistant)}
          canDelete={canDeleteAssistant(assistantContextMenu.assistant)}
          onClose={() => setAssistantContextMenu(null)}
          onRename={() => {
            setRenameSessionId(null)
            setRenameAssistantId(assistantContextMenu.assistant.id)
          }}
          onDelete={() => setDeleteAssistantTarget(assistantContextMenu.assistant)}
        />
      ) : null}

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
