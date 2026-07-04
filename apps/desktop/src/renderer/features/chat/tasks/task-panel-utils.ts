import {
  isActiveTaskStatus,
  parseMessageTaskId,
  type AgentTask,
  type TaskEvent,
} from '@toolman/shared'

export type TaskListFilter = 'all' | 'active' | 'done'

function isTerminalTaskStatus(status: AgentTask['status']): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
}

export const TASK_RESOLVED_WORKING_DIRECTORY_KEY = 'resolvedWorkingDirectory'
export const TASK_WORKING_DIRECTORY_WARNING_KEY = 'taskWorkingDirectoryWarning'

export function getTaskRecencyTimestamp(task: AgentTask): number {
  return Math.max(task.updatedAt, task.createdAt)
}

export function getTaskWorkingDirectoryWarning(task: AgentTask): string | undefined {
  const warning = task.metadata[TASK_WORKING_DIRECTORY_WARNING_KEY]
  return typeof warning === 'string' && warning.trim() ? warning.trim() : undefined
}

export function getTaskResolvedWorkingDirectory(task: AgentTask): string | undefined {
  const workingDirectory = task.metadata[TASK_RESOLVED_WORKING_DIRECTORY_KEY]
  return typeof workingDirectory === 'string' && workingDirectory.trim()
    ? workingDirectory.trim()
    : undefined
}

export function resolveEffectiveSessionActiveTaskId(
  sessionActiveTaskId: string | null | undefined,
  tasks: AgentTask[],
): string | null {
  if (!sessionActiveTaskId) return null
  const bound = tasks.find((task) => task.id === sessionActiveTaskId)
  if (!bound || isTerminalTaskStatus(bound.status)) return null
  return sessionActiveTaskId
}

export function resolveLatestMessageTaskId(
  messages: Array<{ role?: string; metadata?: Record<string, unknown> | null }>,
): string | null {
  let sawUserMessageWithoutTask = false

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role !== 'user') continue

    const taskId = parseMessageTaskId(message.metadata)
    if (taskId) {
      if (sawUserMessageWithoutTask) return null
      return taskId
    }
    sawUserMessageWithoutTask = true
  }
  return null
}

export function pickPreferredTaskId(
  tasks: AgentTask[],
  options?: {
    sessionActiveTaskId?: string | null
    latestMessageTaskId?: string | null
  },
): string | null {
  if (tasks.length === 0) return null

  const sessionActiveTaskId = options?.sessionActiveTaskId
  const latestMessageTaskId = options?.latestMessageTaskId

  if (latestMessageTaskId) {
    const fromMessage = tasks.find((task) => task.id === latestMessageTaskId)
    if (fromMessage) return fromMessage.id
  }

  const boundId = resolveEffectiveSessionActiveTaskId(sessionActiveTaskId, tasks)
  if (boundId) return boundId

  const activeTasks = tasks.filter((task) => !isTerminalTaskStatus(task.status))
  const pool = activeTasks.length > 0 ? activeTasks : tasks

  const sorted = [...pool].sort(
    (a, b) => getTaskRecencyTimestamp(b) - getTaskRecencyTimestamp(a),
  )
  return sorted[0]?.id ?? null
}

export function isActiveTaskListItem(task: AgentTask): boolean {
  return !isTerminalTaskStatus(task.status)
}

export function filterTasksByTab(
  tasks: AgentTask[],
  filter: TaskListFilter,
  focusTaskId?: string | null,
): AgentTask[] {
  if (filter === 'active') {
    return filterTasksForActiveTab(tasks, focusTaskId)
  }
  if (filter === 'done') {
    return tasks.filter((task) => isTerminalTaskStatus(task.status))
  }
  return tasks
}

export function getLatestTerminalTask(tasks: AgentTask[]): AgentTask | null {
  const terminal = tasks.filter((task) => isTerminalTaskStatus(task.status))
  if (terminal.length === 0) return null
  return [...terminal].sort((a, b) => getTaskRecencyTimestamp(b) - getTaskRecencyTimestamp(a))[0] ?? null
}

/** Active tab: in-progress tasks, or the focused / most recently ended task when none are active. */
export function filterTasksForActiveTab(
  tasks: AgentTask[],
  focusTaskId?: string | null,
): AgentTask[] {
  const active = sortTasksForDisplay(tasks.filter(isActiveTaskListItem))
  if (active.length > 0) return active

  if (focusTaskId) {
    const focused = tasks.find((task) => task.id === focusTaskId)
    if (focused) return [focused]
  }

  const latestEnded = getLatestTerminalTask(tasks)
  return latestEnded ? [latestEnded] : []
}

export function sortTasksForDisplay(tasks: AgentTask[]): AgentTask[] {
  const rank = (task: AgentTask): number => {
    if (isActiveTaskStatus(task.status) || task.status === 'retrying') return 0
    if (task.status === 'pending') return 1
    if (task.status === 'paused') return 2
    return 3
  }

  return [...tasks].sort((a, b) => {
    const rankDiff = rank(a) - rank(b)
    if (rankDiff !== 0) return rankDiff
    return getTaskRecencyTimestamp(b) - getTaskRecencyTimestamp(a)
  })
}

export function getTaskStepProgress(task: AgentTask): { completed: number; total: number } {
  const steps = task.history.filter((step) => step.kind === 'tool')
  return {
    completed: steps.filter((step) => step.status === 'completed' || step.status === 'skipped').length,
    total: steps.length,
  }
}

export function getTaskDisplayProgress(task: AgentTask): { completed: number; total: number } {
  const history = task.history
  if (history.length > 0) {
    return {
      completed: history.filter((step) => step.status === 'completed' || step.status === 'skipped')
        .length,
      total: history.length,
    }
  }
  return getTaskStepProgress(task)
}

export function shortTaskId(taskId: string): string {
  if (taskId.length <= 16) return taskId
  return `${taskId.slice(0, 8)}…`
}

export function taskTitleInitial(title: string): string {
  const trimmed = title.trim()
  return trimmed ? trimmed.slice(0, 1).toUpperCase() : '?'
}

export type TaskTimelineNodeTone = 'success' | 'failure' | 'neutral' | 'warning'

export function getTaskEventNodeTone(event: TaskEvent): TaskTimelineNodeTone {
  switch (event.type) {
    case 'task.tool.finished':
      return event.success ? 'success' : 'failure'
    case 'task.finished':
      if (event.status === 'failed' || event.status === 'cancelled') return 'failure'
      if (event.status === 'completed') return 'success'
      return 'neutral'
    case 'task.retry':
      return 'warning'
    case 'task.reflection':
      return event.verdict === 'fail' ? 'failure' : 'success'
    case 'task.started':
    case 'task.resumed':
    case 'task.tool.started':
    case 'task.step.started':
      return 'success'
    default:
      return 'neutral'
  }
}

export function countActiveAgentTasks(tasks: AgentTask[]): number {
  return tasks.filter(isActiveTaskListItem).length
}

export function formatTaskUpdatedAt(timestamp: number, t: (key: string) => string): string {
  const diffMs = Date.now() - timestamp
  if (diffMs < 60_000) {
    return t('chat.tasks.updatedJustNow')
  }
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 60) {
    return t('chat.tasks.updatedMinutes').replace('{{count}}', String(minutes))
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return t('chat.tasks.updatedHours').replace('{{count}}', String(hours))
  }
  return new Date(timestamp).toLocaleDateString()
}

export function formatTaskEventTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function getTaskEventCssModifier(eventType: TaskEvent['type']): string {
  return eventType.replace(/\./g, '-')
}

export function formatTaskFailureReason(task: AgentTask): string | null {
  const reason =
    (typeof task.metadata.orchestratorFailureReason === 'string'
      ? task.metadata.orchestratorFailureReason
      : undefined) ||
    (typeof task.metadata.stageGateFailureReason === 'string'
      ? task.metadata.stageGateFailureReason
      : undefined) ||
    (typeof task.metadata.executorFailureReason === 'string'
      ? task.metadata.executorFailureReason
      : undefined) ||
    (typeof task.metadata.lastReflection === 'object' &&
    task.metadata.lastReflection &&
    !Array.isArray(task.metadata.lastReflection) &&
    typeof (task.metadata.lastReflection as { reason?: unknown }).reason === 'string'
      ? (task.metadata.lastReflection as { reason: string }).reason
      : undefined)

  return reason?.trim() ? reason.trim() : null
}

function buildSyntheticTimelineEvents(task: AgentTask): TaskEvent[] {
  const synthetic: TaskEvent[] = []

  for (const step of task.history) {
    const timestamp = step.startedAt ?? step.finishedAt ?? task.updatedAt
    synthetic.push({
      type: 'task.step.started',
      taskId: task.id,
      workspaceId: task.workspaceId,
      sessionId: task.sessionId,
      timestamp,
      stepId: step.id,
      stepKind: step.kind,
      stepTitle: step.title,
    })

    if (step.kind === 'tool' && step.status === 'completed') {
      synthetic.push({
        type: 'task.tool.finished',
        taskId: task.id,
        workspaceId: task.workspaceId,
        sessionId: task.sessionId,
        timestamp: step.finishedAt ?? timestamp + 1,
        stepId: step.id,
        toolName: step.title,
        success: true,
      })
    }

    if (step.kind === 'tool' && step.status === 'failed') {
      synthetic.push({
        type: 'task.tool.finished',
        taskId: task.id,
        workspaceId: task.workspaceId,
        sessionId: task.sessionId,
        timestamp: step.finishedAt ?? timestamp + 1,
        stepId: step.id,
        toolName: step.title,
        success: false,
        error: step.error,
      })
    }
  }

  return synthetic
}

export function buildTaskTimelineEvents(events: TaskEvent[], task?: AgentTask): TaskEvent[] {
  if (!task || task.history.length === 0) {
    return events
  }

  const hasDetailedEvents = events.some(
    (event) =>
      event.type === 'task.tool.started' ||
      event.type === 'task.tool.finished' ||
      event.type === 'task.step.started' ||
      event.type === 'task.reflection',
  )

  if (hasDetailedEvents) {
    return events
  }

  const synthetic = buildSyntheticTimelineEvents(task)
  const merged = [...events]
  for (const event of synthetic) {
    const exists = merged.some(
      (item) =>
        item.type === event.type &&
        item.timestamp === event.timestamp &&
        ('stepId' in item && 'stepId' in event ? item.stepId === event.stepId : true),
    )
    if (!exists) {
      merged.push(event)
    }
  }

  return merged.sort((a, b) => a.timestamp - b.timestamp)
}

export function formatTaskStatusLabel(
  status: AgentTask['status'],
  t: (key: string) => string,
): string {
  const key = `chat.tasks.status.${status}`
  const translated = t(key)
  return translated === key ? status : translated
}

export function formatTaskEventLabel(event: TaskEvent, t: (key: string) => string): string {
  switch (event.type) {
    case 'task.started':
      return t('chat.taskEvents.started').replace('{{title}}', event.title)
    case 'task.paused':
      return t('chat.taskEvents.paused')
    case 'task.resumed':
      return t('chat.taskEvents.resumed')
    case 'task.finished':
      return t(`chat.taskEvents.finished.${event.status}`)
    case 'task.artifact.created':
      return t('chat.taskEvents.artifactCreated').replace('{{name}}', event.name)
    case 'task.tool.started':
      return t('chat.taskEvents.toolStarted').replace('{{tool}}', event.toolName)
    case 'task.tool.finished':
      return event.success
        ? t('chat.taskEvents.toolFinished').replace('{{tool}}', event.toolName)
        : t('chat.taskEvents.toolFailed').replace('{{tool}}', event.toolName)
    case 'task.retry':
      return t('chat.taskEvents.retry').replace('{{count}}', String(event.retryCount))
    case 'task.checkpoint':
      return t('chat.taskEvents.checkpoint')
    case 'task.step.started':
      return t('chat.taskEvents.stepStarted').replace('{{title}}', event.stepTitle)
    case 'task.reflection':
      return t(`chat.taskEvents.reflection.${event.verdict}`).replace(
        '{{summary}}',
        event.summary ?? '',
      )
    default:
      return (event as TaskEvent).type
  }
}
