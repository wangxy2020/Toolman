import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { IpcChannel, type AgentTask } from '@toolman/shared'

import { HeaderIconButton } from '../../../components/layout/HeaderIconButton'
import { IconActivity, IconCheck, IconListBullet, IconRefresh, IconTrash } from '../../../components/icons'
import { useI18n } from '../../../i18n/useI18n'
import { AgentTaskFoldableItem } from './AgentTaskFoldableItem'
import {
  filterTasksByTab,
  pickPreferredTaskId,
  resolveEffectiveSessionActiveTaskId,
  sortTasksForDisplay,
  type TaskListFilter,
} from './task-panel-utils'
import type { useAgentTasks } from './useAgentTasks'

type TaskPanelController = Pick<
  ReturnType<typeof useAgentTasks>,
  'selectedTask' | 'controllingTaskId' | 'controlTask'
>

interface Props extends TaskPanelController {
  open: boolean
  anchorRef: React.RefObject<HTMLElement | null>
  tasks: AgentTask[]
  loading: boolean
  error?: string | null
  selectedTaskId: string | null
  sessionActiveTaskId?: string | null
  controllingTaskId: string | null
  onSelectTask: (taskId: string) => void
  onPauseTask: (taskId: string) => void
  onResumeTask: (taskId: string) => void
  onCancelTask: (taskId: string) => void
  onReload?: () => void
  onSilentReload?: () => void
  latestMessageTaskId?: string | null
  onClose: () => void
}

const POPUP_WIDTH = 420
const POPUP_MAX_HEIGHT = 680
const POPUP_VIEWPORT_OFFSET = 96
const FILTERS: TaskListFilter[] = ['active', 'done', 'all']

const FILTER_ICONS = {
  active: IconActivity,
  done: IconCheck,
  all: IconListBullet,
} as const

export function AgentTasksMenu({
  open,
  anchorRef,
  tasks,
  loading,
  error,
  selectedTaskId,
  sessionActiveTaskId,
  controllingTaskId,
  controlTask,
  onSelectTask,
  onReload,
  onSilentReload,
  latestMessageTaskId,
  onClose,
}: Props) {
  const { t } = useI18n()
  const panelRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const [filter, setFilter] = useState<TaskListFilter>('active')
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(() => new Set())
  const [clearingTimeline, setClearingTimeline] = useState(false)
  const [timelineReloadToken, setTimelineReloadToken] = useState(0)
  const [localError, setLocalError] = useState<string | null>(null)
  const [activeTabHeight, setActiveTabHeight] = useState<number | null>(null)

  const activeCount = tasks.filter(
    (task) => task.status !== 'completed' && task.status !== 'failed' && task.status !== 'cancelled',
  ).length

  const visibleTasks = useMemo(
    () => sortTasksForDisplay(filterTasksByTab(tasks, filter, latestMessageTaskId)),
    [filter, latestMessageTaskId, tasks],
  )

  const effectiveSessionActiveTaskId = useMemo(
    () => resolveEffectiveSessionActiveTaskId(sessionActiveTaskId, tasks),
    [sessionActiveTaskId, tasks],
  )

  const collapsible = filter !== 'active'
  const clearTargetTaskId = useMemo(() => {
    if (selectedTaskId && visibleTasks.some((task) => task.id === selectedTaskId)) {
      return selectedTaskId
    }
    return visibleTasks[0]?.id ?? null
  }, [selectedTaskId, visibleTasks])

  const selectionOptions = useMemo(
    () => ({
      sessionActiveTaskId: effectiveSessionActiveTaskId,
      latestMessageTaskId,
    }),
    [effectiveSessionActiveTaskId, latestMessageTaskId],
  )

  const handleSilentRefresh = useCallback(() => {
    onSilentReload?.()
  }, [onSilentReload])

  useEffect(() => {
    if (!open) return
    handleSilentRefresh()
  }, [handleSilentRefresh, open])

  useEffect(() => {
    if (!open) {
      setActiveTabHeight(null)
    }
  }, [open])

  useLayoutEffect(() => {
    if (!open || !panelRef.current || filter !== 'active') return

    const frame = requestAnimationFrame(() => {
      const panel = panelRef.current
      if (!panel) return
      const measured = Math.ceil(panel.getBoundingClientRect().height)
      if (measured <= 0) return
      const maxHeight = Math.min(POPUP_MAX_HEIGHT, window.innerHeight - POPUP_VIEWPORT_OFFSET)
      setActiveTabHeight(Math.min(measured, maxHeight))
    })

    return () => cancelAnimationFrame(frame)
  }, [
    error,
    expandedTaskIds,
    filter,
    loading,
    localError,
    open,
    tasks.length,
    visibleTasks.length,
  ])

  useEffect(() => {
    if (!open) return
    if (visibleTasks.length === 0) return

    const preferredId = pickPreferredTaskId(visibleTasks, selectionOptions)
    if (!preferredId) return

    const selectedVisible = selectedTaskId
      ? visibleTasks.some((task) => task.id === selectedTaskId)
      : false

    if (!selectedVisible || (filter === 'active' && selectedTaskId !== preferredId)) {
      onSelectTask(preferredId)
    }
  }, [filter, onSelectTask, open, selectedTaskId, selectionOptions, visibleTasks])

  useEffect(() => {
    if (filter === 'active') {
      setExpandedTaskIds(new Set(visibleTasks.map((task) => task.id)))
    }
  }, [filter, visibleTasks])

  useEffect(() => {
    if (filter === 'active') return
    setExpandedTaskIds(new Set())
  }, [filter])

  useEffect(() => {
    if (!open) return
    const anchor = anchorRef.current
    if (!anchor) return
    const rect = anchor.getBoundingClientRect()
    setPosition({
      top: rect.bottom + 8,
      left: Math.max(12, rect.right - POPUP_WIDTH),
    })
  }, [anchorRef, open])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (panelRef.current?.contains(target)) return
      if (anchorRef.current?.contains(target)) return
      onClose()
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [anchorRef, onClose, open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, open])

  const toggleTaskExpanded = (taskId: string) => {
    onSelectTask(taskId)
    if (!collapsible) return
    setExpandedTaskIds((current) => {
      const next = new Set(current)
      if (next.has(taskId)) {
        next.delete(taskId)
      } else {
        next.add(taskId)
      }
      return next
    })
  }

  const handleClearTimeline = async () => {
    if (!clearTargetTaskId || clearingTimeline) return
    setClearingTimeline(true)
    setLocalError(null)
    const result = await window.api.invoke(IpcChannel.TaskEventClear, {
      taskId: clearTargetTaskId,
    })
    setClearingTimeline(false)
    if (!result.ok) {
      setLocalError(result.error.message)
      return
    }
    setTimelineReloadToken((value) => value + 1)
    window.dispatchEvent(
      new CustomEvent('toolman:task-events-cleared', { detail: { taskId: clearTargetTaskId } }),
    )
  }

  if (!open) return null

  return createPortal(
    <div
      ref={panelRef}
      className="tm-agent-tasks-popup"
      style={{
        top: position.top,
        left: position.left,
        ...(filter !== 'active' && activeTabHeight != null
          ? { minHeight: activeTabHeight, height: activeTabHeight }
          : { maxHeight: Math.min(POPUP_MAX_HEIGHT, window.innerHeight - POPUP_VIEWPORT_OFFSET) }),
      }}
      role="dialog"
      aria-label={t('chat.tasks.menuAria')}
      data-testid="agent-tasks-menu"
    >
      <header className="tm-agent-tasks-popup-header">
        <div className="tm-agent-tasks-popup-heading">
          <h3 className="tm-agent-tasks-popup-title">{t('chat.tasks.sidebarTitle')}</h3>
          <p className="tm-agent-tasks-popup-subtitle">
            {t('chat.tasks.menuSubtitle', { total: tasks.length, active: activeCount })}
          </p>
        </div>
        <div className="tm-agent-tasks-popup-toolbar">
          <div
            className="tm-agent-tasks-popup-filters"
            role="tablist"
            aria-label={t('chat.tasks.filterLabel')}
          >
            {FILTERS.map((item) => {
              const Icon = FILTER_ICONS[item]
              return (
                <HeaderIconButton
                  key={item}
                  role="tab"
                  aria-selected={filter === item}
                  className="tm-agent-tasks-popup-filter-btn"
                  label={t(`chat.tasks.filters.${item}`)}
                  active={filter === item}
                  data-testid={`task-filter-${item}`}
                  onClick={() => setFilter(item)}
                >
                  <Icon size={16} />
                </HeaderIconButton>
              )
            })}
          </div>
          <HeaderIconButton
            className="tm-agent-tasks-popup-action-btn"
            label={t('chat.tasks.clearTimeline')}
            disabled={!clearTargetTaskId || clearingTimeline}
            data-testid="task-clear-timeline-button"
            onClick={() => void handleClearTimeline()}
          >
            <IconTrash size={16} />
          </HeaderIconButton>
          {onReload ? (
            <HeaderIconButton
              className="tm-agent-tasks-popup-action-btn"
              label={t('chat.tasks.refresh')}
              disabled={loading}
              data-testid="task-refresh-button"
              onClick={() => onReload()}
            >
              <IconRefresh size={16} />
            </HeaderIconButton>
          ) : null}
        </div>
      </header>

      {error || localError ? <div className="tm-error-bar">{error ?? localError}</div> : null}

      <div className="tm-agent-tasks-popup-body" data-testid="task-sidebar">
        {loading && tasks.length === 0 ? (
          <div className="tm-agent-tasks-popup-empty">{t('common.loading')}</div>
        ) : null}

        {!loading && tasks.length === 0 ? (
          <div className="tm-agent-tasks-popup-empty">
            <p className="tm-agent-tasks-popup-empty-title">{t('chat.tasks.emptyTitle')}</p>
            <p className="tm-agent-tasks-popup-empty-hint">{t('chat.tasks.emptyHint')}</p>
          </div>
        ) : null}

        {!loading && tasks.length > 0 && visibleTasks.length === 0 ? (
          <div className="tm-agent-tasks-popup-empty">{t('chat.tasks.filterEmpty')}</div>
        ) : null}

        {visibleTasks.length > 0 ? (
          <div className="tm-agent-tasks-popup-list">
            {visibleTasks.map((task) => (
              <AgentTaskFoldableItem
                key={task.id}
                task={task}
                bound={effectiveSessionActiveTaskId === task.id}
                expanded={expandedTaskIds.has(task.id)}
                collapsible={collapsible}
                onToggle={() => toggleTaskExpanded(task.id)}
                sessionActiveTaskId={effectiveSessionActiveTaskId}
                controllingTaskId={controllingTaskId}
                controlTask={controlTask}
                timelineReloadToken={timelineReloadToken}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
