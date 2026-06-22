import { useEffect, useMemo, useState } from 'react'
import type { Assistant, Session } from '@toolman/shared'
import { ConfirmDialog } from '../ConfirmDialog'
import { IconChevronRight, IconPlus, IconTopic } from '../icons'
import { SidebarRenameInput } from '../../features/notes/SidebarRenameInput'
import { isGroupProxyAssistant } from '../../features/group/group-agent-utils'

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
        title={session.title}
      >
        <span className="tm-session-item-icon" aria-hidden="true">
          <IconTopic size={14} />
        </span>
        <span className="tm-session-item-label">{session.title}</span>
      </button>
    )
  }

  return (
    <aside className="tm-sidebar">
      <div className="tm-sidebar-content">
        <button type="button" className="tm-sidebar-add" onClick={onAddAssistant}>
          <IconPlus />
          添加智能体
        </button>

        <div className="tm-sidebar-list">
          {sessionsLoading && assistants.length === 0 && (
            <div className="tm-empty">加载中…</div>
          )}
          {!sessionsLoading && assistants.length === 0 && (
            <div className="tm-empty">暂无智能体，点击上方添加</div>
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
                    title={isOpen ? '收起历史' : '展开历史'}
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
                    {assistant.name}
                  </button>
                  <div className="tm-assistant-actions">
                    <button
                      type="button"
                      className="tm-assistant-action-btn"
                      title="新建话题"
                      onClick={() => onCreateSession(assistant.id)}
                    >
                      <IconPlus size={14} />
                    </button>
                  </div>
                </div>

                {isOpen &&
                  (assistantSessions.length === 0 ? (
                    <div className="tm-session-empty">暂无历史话题</div>
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
                <span className="tm-assistant-name tm-assistant-name--static">其他话题</span>
                <div className="tm-assistant-actions tm-assistant-actions--placeholder" aria-hidden="true" />
              </div>
              {unassigned.map(renderSession)}
            </div>
          )}
        </div>
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title="删除话题"
          message={`确定删除「${deleteTarget.title}」？删除后无法恢复。`}
          confirmLabel="删除"
          cancelLabel="取消"
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
          title="删除智能体"
          message={
            isGroupProxyAssistant(deleteAssistantTarget)
              ? `确定删除「${deleteAssistantTarget.name}」？该智能体下的本地话题将一并删除；之后仍可通过群组智能体重新打开。`
              : `确定删除「${deleteAssistantTarget.name}」？该智能体下的所有话题将一并删除，且无法恢复。`
          }
          confirmLabel="删除"
          cancelLabel="取消"
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
