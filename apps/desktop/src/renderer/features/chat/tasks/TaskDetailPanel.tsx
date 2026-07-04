import { useCallback, useEffect, useState } from 'react'
import { IpcChannel, isTerminalTaskStatus, type TaskArtifact } from '@toolman/shared'

import { useI18n } from '../../../i18n/useI18n'
import { LocalFilePathLink } from '../LocalFilePathLink'
import { getFolderDisplayName } from '../workspace-utils'
import { useSystemPaths } from '../useSystemPaths'
import { useTaskEvents } from '../useTaskEvents'
import { TaskTimelineItem } from './TaskTimelineItem'
import {
  formatTaskStatusLabel,
  getTaskResolvedWorkingDirectory,
  getTaskWorkingDirectoryWarning,
} from './task-panel-utils'
import {
  canCancelTask,
  canPauseTask,
  canResumeTask,
  getTaskCurrentStepTitle,
  type useAgentTasks,
} from './useAgentTasks'

type TaskPanelController = Pick<
  ReturnType<typeof useAgentTasks>,
  'selectedTask' | 'controllingTaskId' | 'controlTask'
>

interface Props extends TaskPanelController {
  sessionActiveTaskId?: string | null
  /** Render inside the autonomous tasks menu popup. */
  embedded?: boolean
  /** Popup menu: only controls + artifacts; card/timeline rendered by parent. */
  layout?: 'full' | 'footer'
}

function useTaskArtifacts(taskId: string | null | undefined) {
  const [artifacts, setArtifacts] = useState<TaskArtifact[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!taskId) {
      setArtifacts([])
      return
    }

    setLoading(true)
    const result = await window.api.invoke(IpcChannel.TaskArtifactList, { taskId })
    setLoading(false)

    if (!result.ok) {
      setArtifacts([])
      return
    }

    const data = result.data as { items: TaskArtifact[] }
    setArtifacts(data.items)
  }, [taskId])

  useEffect(() => {
    void load()
  }, [load])

  return { artifacts, loading, reload: load }
}

export function TaskDetailPanel({
  selectedTask,
  controllingTaskId,
  controlTask,
  sessionActiveTaskId,
  embedded = false,
  layout = 'full',
}: Props) {
  const { t } = useI18n()
  const systemPaths = useSystemPaths()
  const taskId = selectedTask?.id
  const { events, loading: eventsLoading } = useTaskEvents(taskId)
  const { artifacts, loading: artifactsLoading, reload: reloadArtifacts } = useTaskArtifacts(taskId)

  const isBoundToSession = sessionActiveTaskId === selectedTask?.id
  const showBoundHint =
    isBoundToSession &&
    selectedTask &&
    !isTerminalTaskStatus(selectedTask.status)

  useEffect(() => {
    if (!taskId) return
    const unsubscribe = window.api.subscribe(IpcChannel.TaskStream, (payload) => {
      const event = payload as { taskId?: string; type?: string }
      if (event.taskId !== taskId) return
      if (event.type === 'task.artifact.created') {
        void reloadArtifacts()
      }
    })
    return unsubscribe
  }, [reloadArtifacts, taskId])

  if (!selectedTask) {
    return null
  }

  const stepTitle = getTaskCurrentStepTitle(selectedTask)
  const controlling = controllingTaskId === selectedTask.id
  const workingDirectoryWarning = getTaskWorkingDirectoryWarning(selectedTask)
  const resolvedWorkingDirectory = getTaskResolvedWorkingDirectory(selectedTask)
  const workingDirectoryLabel = resolvedWorkingDirectory
    ? getFolderDisplayName(resolvedWorkingDirectory, systemPaths)
    : null

  const handleControl = async (action: 'pause' | 'resume' | 'cancel') => {
    await controlTask(selectedTask.id, action)
  }

  const isFooterLayout = embedded && layout === 'footer'
  const showTimeline = !isFooterLayout
  const showHeading = !isFooterLayout

  return (
    <div
      className={[
        'tm-task-detail-panel',
        embedded ? 'tm-task-detail-panel--embedded' : '',
        isFooterLayout ? 'tm-task-detail-panel--footer' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="region"
      aria-label={t('chat.tasks.detailTitle')}
      data-testid={isFooterLayout ? undefined : 'task-detail-panel'}
    >
      <div className="tm-task-detail-header">
        {showHeading ? (
          <>
            <div className="tm-task-detail-heading">
              <span className="tm-task-detail-title">{selectedTask.title}</span>
              <span
                className={`tm-task-detail-status tm-task-detail-status--${selectedTask.status}`}
                data-testid="task-status-badge"
              >
                {formatTaskStatusLabel(selectedTask.status, t)}
              </span>
            </div>
            {selectedTask.goal ? (
              <div className="tm-task-detail-goal" title={selectedTask.goal}>
                {selectedTask.goal}
              </div>
            ) : null}
            {showBoundHint ? (
              <div className="tm-task-detail-bound">{t('chat.input.autonomousTaskBound')}</div>
            ) : null}
            {workingDirectoryWarning ? (
              <div
                className="tm-task-detail-warning"
                data-testid="task-working-directory-warning"
                title={workingDirectoryWarning}
              >
                {workingDirectoryWarning}
              </div>
            ) : resolvedWorkingDirectory && workingDirectoryLabel ? (
              <div
                className="tm-task-detail-working-directory"
                data-testid="task-working-directory"
                title={resolvedWorkingDirectory}
              >
                {t('chat.tasks.workingDirectory').replace('{{path}}', workingDirectoryLabel)}
              </div>
            ) : null}
            {stepTitle ? (
              <div className="tm-task-detail-step">
                {t('chat.tasks.currentStep').replace('{{title}}', stepTitle)}
              </div>
            ) : null}
            {selectedTask.retryCount > 0 ? (
              <div className="tm-task-detail-retry">
                {t('chat.tasks.retryCount').replace('{{count}}', String(selectedTask.retryCount))}
              </div>
            ) : null}
          </>
        ) : null}
        <div className="tm-task-detail-actions">
          {canPauseTask(selectedTask) ? (
            <button
              type="button"
              className="tm-task-detail-action"
              data-testid="task-control-pause"
              disabled={controlling}
              onClick={() => void handleControl('pause')}
            >
              {t('chat.tasks.pause')}
            </button>
          ) : null}
          {canResumeTask(selectedTask) ? (
            <button
              type="button"
              className="tm-task-detail-action"
              data-testid="task-control-resume"
              disabled={controlling}
              onClick={() => void handleControl('resume')}
            >
              {t('chat.tasks.resume')}
            </button>
          ) : null}
          {canCancelTask(selectedTask) ? (
            <button
              type="button"
              className="tm-task-detail-action tm-task-detail-action--danger"
              data-testid="task-control-cancel"
              disabled={controlling}
              onClick={() => void handleControl('cancel')}
            >
              {t('chat.tasks.cancel')}
            </button>
          ) : null}
        </div>
      </div>

      {showTimeline ? (
        <div className="tm-task-detail-section">
          <div className="tm-task-detail-section-title">{t('chat.tasks.timelineTitle')}</div>
          {eventsLoading ? (
            <p className="tm-task-detail-empty">{t('chat.taskEvents.loading')}</p>
          ) : events.length === 0 ? (
            <p className="tm-task-detail-empty">{t('chat.taskEvents.empty')}</p>
          ) : (
            <ul className="tm-task-detail-timeline">
              {events.map((event) => (
                <TaskTimelineItem
                  key={`${event.type}-${event.timestamp}`}
                  event={event}
                  className="tm-task-detail-timeline-item"
                />
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <div className="tm-task-detail-section">
        <div className="tm-task-detail-section-title">{t('chat.tasks.artifactsTitle')}</div>
        {artifactsLoading ? (
          <p className="tm-task-detail-empty">{t('chat.taskEvents.loading')}</p>
        ) : artifacts.length === 0 ? (
          <p className="tm-task-detail-empty">{t('chat.tasks.artifactsEmpty')}</p>
        ) : (
          <ul className="tm-task-detail-artifacts">
            {artifacts.map((artifact) => (
              <li key={artifact.id} className="tm-task-detail-artifact">
                <LocalFilePathLink path={artifact.absolutePath} action="reveal" />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
