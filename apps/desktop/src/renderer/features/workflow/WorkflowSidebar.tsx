import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Assistant, Session } from '@toolman/shared'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { IconChevronRight, IconPlus, IconTopic } from '../../components/icons'
import { SidebarRenameInput } from '../notes/SidebarRenameInput'
import { useI18n } from '../../i18n/useI18n'
import {
  bindAutomationSubTaskSession,
  pruneOrphanAutomationSessions,
} from './automation-session-binding'
import { resolveAutomationAssistant } from './resolve-automation-assistant'
import { useWorkflows } from './useWorkflows'
import type { LocalWorkflowItem } from './workflow-types'

function normalizeName(next: string, fallback: string): string {
  const trimmed = next.trim()
  return trimmed || fallback
}

interface Props {
  assistants: Assistant[]
  sessions: Session[]
  activeSession: Session | null
  createSession: (assistantId?: string) => Promise<Session | null>
  selectSession: (sessionId: string) => Promise<void>
  renameSession: (id: string, title: string) => Promise<unknown> | unknown
  deleteSession: (id: string) => Promise<unknown>
}

export function WorkflowSidebar({
  assistants,
  sessions,
  activeSession,
  createSession,
  selectSession,
  renameSession,
  deleteSession,
}: Props) {
  const { t } = useI18n()
  const automationAssistant = useMemo(
    () => resolveAutomationAssistant(assistants),
    [assistants],
  )
  const assistantId = automationAssistant?.id
  const {
    tasks,
    childrenByParent,
    items,
    activeId,
    activeTask,
    loading,
    select,
    createTask,
    createSubTask,
    rename,
    linkSession,
    remove,
  } = useWorkflows()
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [renameId, setRenameId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<LocalWorkflowItem | null>(null)
  const [creating, setCreating] = useState(false)
  const prunedAssistantsRef = useRef(new Set<string>())

  const chatLike = useMemo(
    () => ({
      sessions,
      activeSession,
      createSession,
      selectSession,
      renameSession,
      deleteSession,
    }),
    [sessions, activeSession, createSession, selectSession, renameSession, deleteSession],
  )

  useEffect(() => {
    if (!activeTask) return
    setExpanded((prev) => {
      if (prev.has(activeTask.id)) return prev
      const next = new Set(prev)
      next.add(activeTask.id)
      return next
    })
  }, [activeTask])

  useEffect(() => {
    if (!assistantId || loading) return
    if (prunedAssistantsRef.current.has(assistantId)) return
    prunedAssistantsRef.current.add(assistantId)
    const linked = new Set(
      items
        .map((item) => item.sessionId)
        .filter((id): id is string => Boolean(id)),
    )
    void pruneOrphanAutomationSessions({
      automationAssistantId: assistantId,
      linkedSessionIds: linked,
      sessions,
      deleteSession,
      activeSessionId: activeSession?.id,
      defaultSubTaskTitles: [t('workflowPage.newSubTaskName')],
    })
  }, [
    assistantId,
    loading,
    items,
    sessions,
    deleteSession,
    activeSession?.id,
    t,
  ])

  const ensureSubTaskSession = useCallback(
    async (item: LocalWorkflowItem) => {
      if (!automationAssistant) return
      await bindAutomationSubTaskSession({
        item,
        automationAssistant,
        chat: chatLike,
        linkSession,
      })
    },
    [automationAssistant, chatLike, linkSession],
  )

  const createDefaultSubTask = async (task: LocalWorkflowItem) => {
    const name = t('workflowPage.newSubTaskName')
    let sessionId: string | undefined
    if (assistantId) {
      const created = await createSession(assistantId)
      if (created) {
        await renameSession(created.id, name)
        sessionId = created.id
      }
    }
    const subTask = await createSubTask(task.id, name, sessionId)
    setExpanded((prev) => new Set(prev).add(task.id))
    select(subTask.id)
    return subTask
  }

  const handleCreateTask = async () => {
    if (creating) return
    setCreating(true)
    try {
      const task = await createTask(t('workflowPage.newTask'))
      setExpanded((prev) => new Set(prev).add(task.id))
      await createDefaultSubTask(task)
    } catch {
      // Error is surfaced via useWorkflows.error in the main pane.
    } finally {
      setCreating(false)
    }
  }

  const handleCreateSubTask = async (task: LocalWorkflowItem) => {
    try {
      await createDefaultSubTask(task)
    } catch {
      // Error is surfaced via useWorkflows.error in the main pane.
    }
  }

  const toggleExpanded = (taskId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }

  const renderSubTask = (item: LocalWorkflowItem) => {
    const isActive = activeId === item.id
    const isRenaming = renameId === item.id

    if (isRenaming) {
      return (
        <SidebarRenameInput
          key={item.id}
          value={item.name}
          className="tm-sidebar-rename-input tm-sidebar-rename-input--note"
          onCommit={(next) => {
            void rename(item.id, normalizeName(next, item.name))
            setRenameId(null)
          }}
          onCancel={() => setRenameId(null)}
        />
      )
    }

    return (
      <button
        key={item.id}
        type="button"
        className={[
          'tm-session-item',
          'tm-session-item--with-icon',
          isActive ? 'tm-session-item--active' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={() => {
          select(item.id)
          void ensureSubTaskSession(item)
        }}
        onDoubleClick={(event) => {
          event.preventDefault()
          setRenameId(item.id)
        }}
        onContextMenu={(event) => {
          event.preventDefault()
          setDeleteTarget(item)
        }}
        title={item.name}
      >
        <span className="tm-session-item-icon" aria-hidden="true">
          <IconTopic size={14} />
        </span>
        <span className="tm-session-item-label">{item.name}</span>
      </button>
    )
  }

  return (
    <aside className="tm-sidebar">
      <div className="tm-sidebar-content">
        <button
          type="button"
          className="tm-sidebar-add"
          disabled={creating}
          onClick={() => void handleCreateTask()}
        >
          <IconPlus />
          {t('modules.workflow.addLabel')}
        </button>

        <div className="tm-sidebar-list">
          {loading && tasks.length === 0 ? (
            <div className="tm-empty">{t('common.loading')}</div>
          ) : tasks.length === 0 ? (
            <div className="tm-empty">{t('modules.workflow.sidebarEmptyHint')}</div>
          ) : (
            tasks.map((task) => {
              const children = childrenByParent.get(task.id) ?? []
              const isOpen = expanded.has(task.id)
              const isActive = activeTask?.id === task.id
              const isRenaming = renameId === task.id

              return (
                <div key={task.id} className="tm-assistant-group">
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
                      title={isOpen ? t('common.collapse') : t('common.expand')}
                      onClick={() => toggleExpanded(task.id)}
                    >
                      <IconChevronRight open={isOpen} />
                    </button>
                    {isRenaming ? (
                      <SidebarRenameInput
                        value={task.name}
                        className="tm-sidebar-rename-input tm-sidebar-rename-input--note"
                        onCommit={(next) => {
                          void rename(task.id, normalizeName(next, task.name))
                          setRenameId(null)
                        }}
                        onCancel={() => setRenameId(null)}
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
                          select(task.id)
                          toggleExpanded(task.id)
                        }}
                        onDoubleClick={(event) => {
                          event.preventDefault()
                          setRenameId(task.id)
                        }}
                        onContextMenu={(event) => {
                          event.preventDefault()
                          setDeleteTarget(task)
                        }}
                      >
                        {task.name}
                      </button>
                    )}
                    <div className="tm-assistant-actions">
                      <button
                        type="button"
                        className="tm-assistant-action-btn"
                        title={t('workflowPage.newSubTask')}
                        onClick={() => void handleCreateSubTask(task)}
                      >
                        <IconPlus size={14} />
                      </button>
                    </div>
                  </div>

                  {isOpen &&
                    (children.length === 0 ? (
                      <div className="tm-session-empty">{t('workflowPage.emptySubTasks')}</div>
                    ) : (
                      children.map(renderSubTask)
                    ))}
                </div>
              )
            })
          )}
        </div>
      </div>

      {deleteTarget ? (
        <ConfirmDialog
          title={
            deleteTarget.parentId
              ? t('workflowPage.deleteSubTaskTitle')
              : t('workflowPage.deleteTaskTitle')
          }
          message={t(
            deleteTarget.parentId
              ? 'workflowPage.deleteSubTaskMessage'
              : 'workflowPage.deleteTaskMessage',
            { name: deleteTarget.name },
          )}
          confirmLabel={t('common.delete')}
          cancelLabel={t('common.cancel')}
          danger
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => {
            void remove(deleteTarget.id)
            setDeleteTarget(null)
          }}
        />
      ) : null}
    </aside>
  )
}
