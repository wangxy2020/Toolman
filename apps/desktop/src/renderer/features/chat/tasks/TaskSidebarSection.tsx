import { useMemo, useState } from 'react'
import type { AgentTask } from '@toolman/shared'

import { useI18n } from '../../../i18n/useI18n'
import { AgentTaskMenuItem } from './AgentTaskMenuItem'
import { TaskListItem } from './TaskListItem'
import {
  filterTasksByTab,
  sortTasksForDisplay,
  type TaskListFilter,
} from './task-panel-utils'

interface Props {
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
  /** Render inside header dropdown (group members menu layout). */
  embedded?: boolean
}

const FILTERS: TaskListFilter[] = ['all', 'active', 'done']

export function TaskSidebarSection({
  tasks,
  loading,
  error,
  selectedTaskId,
  sessionActiveTaskId,
  controllingTaskId,
  onSelectTask,
  onPauseTask,
  onResumeTask,
  onCancelTask,
  onReload,
  embedded = false,
}: Props) {
  const { t } = useI18n()
  const [filter, setFilter] = useState<TaskListFilter>('all')

  const visibleTasks = useMemo(
    () => sortTasksForDisplay(filterTasksByTab(tasks, filter)),
    [filter, tasks],
  )

  const activeCount = useMemo(
    () => tasks.filter((task) => task.status !== 'completed' && task.status !== 'failed' && task.status !== 'cancelled').length,
    [tasks],
  )

  if (embedded) {
    const embeddedTasks = sortTasksForDisplay(tasks)

    return (
      <div className="tm-agent-tasks-menu-content" data-testid="task-sidebar">
        {loading && tasks.length === 0 ? (
          <div className="tm-session-empty">{t('common.loading')}</div>
        ) : null}

        {!loading && tasks.length === 0 ? (
          <div className="tm-group-members-menu-empty">
            <p className="tm-agent-tasks-menu-empty-title">{t('chat.tasks.emptyTitle')}</p>
            <p className="tm-agent-tasks-menu-empty-hint">{t('chat.tasks.emptyHint')}</p>
          </div>
        ) : null}

        {embeddedTasks.length > 0 ? (
          <ul className="tm-group-member-list tm-group-members-menu-list">
            {embeddedTasks.map((task) => (
              <AgentTaskMenuItem
                key={task.id}
                task={task}
                active={selectedTaskId === task.id}
                bound={sessionActiveTaskId === task.id}
                controlling={controllingTaskId === task.id}
                onSelect={onSelectTask}
                onPause={onPauseTask}
                onResume={onResumeTask}
                onCancel={onCancelTask}
              />
            ))}
          </ul>
        ) : null}
      </div>
    )
  }

  return (
    <div className="tm-task-sidebar" data-testid="task-sidebar">
      <div className="tm-task-sidebar-toolbar">
        <div className="tm-task-sidebar-header">
          {t('chat.tasks.sidebarTitle')}
          <span className="tm-task-sidebar-count">{activeCount}</span>
        </div>
        {onReload ? (
          <button
            type="button"
            className="tm-task-sidebar-refresh"
            data-testid="task-refresh-button"
            title={t('chat.tasks.refresh')}
            disabled={loading}
            onClick={() => onReload()}
          >
            {t('chat.tasks.refresh')}
          </button>
        ) : null}
      </div>

      <div className="tm-task-sidebar-filters" role="tablist" aria-label={t('chat.tasks.filterLabel')}>
        {FILTERS.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={filter === item}
            className={[
              'tm-task-sidebar-filter',
              filter === item ? 'tm-task-sidebar-filter--active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            data-testid={`task-filter-${item}`}
            onClick={() => setFilter(item)}
          >
            {t(`chat.tasks.filters.${item}`)}
          </button>
        ))}
      </div>

      {error ? <div className="tm-task-sidebar-error">{error}</div> : null}

      {loading && tasks.length === 0 ? (
        <div className="tm-task-sidebar-empty">{t('common.loading')}</div>
      ) : null}

      {!loading && tasks.length === 0 ? (
        <div className="tm-task-sidebar-empty">
          <p>{t('chat.tasks.emptyTitle')}</p>
          <p className="tm-task-sidebar-empty-hint">{t('chat.tasks.emptyHint')}</p>
        </div>
      ) : null}

      {visibleTasks.length > 0 ? (
        <div className="tm-task-sidebar-list">
          {visibleTasks.map((task) => (
            <TaskListItem
              key={task.id}
              task={task}
              active={selectedTaskId === task.id}
              bound={sessionActiveTaskId === task.id}
              controlling={controllingTaskId === task.id}
              onSelect={onSelectTask}
              onPause={onPauseTask}
              onResume={onResumeTask}
              onCancel={onCancelTask}
            />
          ))}
        </div>
      ) : null}

      {!loading && tasks.length > 0 && visibleTasks.length === 0 ? (
        <div className="tm-task-sidebar-empty">{t('chat.tasks.filterEmpty')}</div>
      ) : null}
    </div>
  )
}
