import { existsSync, readFileSync } from 'node:fs'

import {
  TaskEventClearInputSchema,
  TaskEventListInputSchema,
  TaskEventSchema,
  taskEventBase,
  type AgentTask,
  type TaskArtifact,
  type TaskEvent,
  type TaskEventListOutput,
  type TaskReflectionVerdict,
  type TaskStatus,
} from '@toolman/shared'

import { publishTaskEvent, subscribeTaskEvents } from './task-event-bus'
import { clearTaskEventLog, getTaskEventLogPath } from './task-event-log'
import { getDefaultTaskRuntimeDir } from './paths'
import { getAgentTask, repairTaskWorkspaceRecord } from './store'
import { unbindTaskFromSession } from './session-bind'
export { subscribeTaskEvents, publishTaskEvent }

export function emitTaskEvent(
  task: Pick<AgentTask, 'id' | 'workspaceId' | 'sessionId' | 'workspaceRoot'>,
  event: TaskEvent,
): void {
  publishTaskEvent(task, event)
}

export function emitTaskStarted(task: AgentTask): void {
  emitTaskEvent(task, {
    type: 'task.started',
    ...taskEventBase(task),
    title: task.title,
    status: task.status,
  })
}

export function emitTaskPaused(task: AgentTask, fromStatus: TaskStatus): void {
  emitTaskEvent(task, {
    type: 'task.paused',
    ...taskEventBase(task),
    fromStatus,
  })
}

export function emitTaskResumed(task: AgentTask, toStatus: TaskStatus): void {
  emitTaskEvent(task, {
    type: 'task.resumed',
    ...taskEventBase(task),
    toStatus,
  })
}

export function emitTaskFinished(
  task: AgentTask,
  status: 'completed' | 'failed' | 'cancelled',
): void {
  emitTaskEvent(task, {
    type: 'task.finished',
    ...taskEventBase(task),
    status,
  })

  if (task.sessionId) {
    try {
      unbindTaskFromSession(task.sessionId, task.id)
    } catch {
      // Best-effort cleanup; binding may already be cleared.
    }
  }
}

export function emitTaskArtifactCreated(task: AgentTask, artifact: TaskArtifact): void {
  emitTaskEvent(task, {
    type: 'task.artifact.created',
    ...taskEventBase(task),
    artifactId: artifact.id,
    name: artifact.name,
    kind: artifact.kind,
    absolutePath: artifact.absolutePath,
  })
}

export function emitTaskToolStarted(
  task: AgentTask,
  input: { toolName: string; stepId?: string; toolCallId?: string },
): void {
  emitTaskEvent(task, {
    type: 'task.tool.started',
    ...taskEventBase(task),
    stepId: input.stepId,
    toolName: input.toolName,
    toolCallId: input.toolCallId,
  })
}

export function emitTaskToolFinished(
  task: AgentTask,
  input: {
    toolName: string
    stepId?: string
    toolCallId?: string
    success: boolean
    error?: string
  },
): void {
  emitTaskEvent(task, {
    type: 'task.tool.finished',
    ...taskEventBase(task),
    stepId: input.stepId,
    toolName: input.toolName,
    toolCallId: input.toolCallId,
    success: input.success,
    error: input.error,
  })
}

export function emitTaskRetry(
  task: AgentTask,
  input: { stepId?: string; retryCount: number; reason?: string },
): void {
  emitTaskEvent(task, {
    type: 'task.retry',
    ...taskEventBase(task),
    stepId: input.stepId,
    retryCount: input.retryCount,
    reason: input.reason,
  })
}

export function emitTaskCheckpoint(
  task: AgentTask,
  input: { stepId?: string; checkpointPath: string },
): void {
  emitTaskEvent(task, {
    type: 'task.checkpoint',
    ...taskEventBase(task),
    stepId: input.stepId,
    checkpointPath: input.checkpointPath,
  })
}

export function emitTaskStepStarted(
  task: AgentTask,
  input: { stepId: string; stepKind: AgentTask['history'][number]['kind']; stepTitle: string },
): void {
  emitTaskEvent(task, {
    type: 'task.step.started',
    ...taskEventBase(task),
    stepId: input.stepId,
    stepKind: input.stepKind,
    stepTitle: input.stepTitle,
  })
}

export function emitTaskReflection(
  task: AgentTask,
  input: { stepId?: string; verdict: TaskReflectionVerdict; summary?: string },
): void {
  emitTaskEvent(task, {
    type: 'task.reflection',
    ...taskEventBase(task),
    stepId: input.stepId,
    verdict: input.verdict,
    summary: input.summary,
  })
}

function resolveTaskEventLogRoots(task: AgentTask): string[] {
  const repaired = repairTaskWorkspaceRecord(task)
  const roots = new Set<string>()
  const defaultRoot = getDefaultTaskRuntimeDir(task.id)
  roots.add(repaired.workspaceRoot?.trim() || defaultRoot)
  roots.add(defaultRoot)
  if (task.workspaceRoot?.trim()) {
    roots.add(task.workspaceRoot.trim())
  }
  return [...roots]
}

export function readTaskEventsFromLog(
  task: Pick<AgentTask, 'id' | 'workspaceRoot'>,
  limit = 100,
): TaskEvent[] {
  const items: TaskEvent[] = []

  for (const line of readTaskEventLogLines(task)) {
    try {
      const event = TaskEventSchema.parse(JSON.parse(line) as unknown)
      if (event.taskId !== task.id) continue
      items.push(event)
    } catch {
      // Skip corrupt log lines.
    }
  }

  return items.sort((a, b) => a.timestamp - b.timestamp).slice(-limit)
}

function readTaskEventLogLines(task: Pick<AgentTask, 'id' | 'workspaceRoot'>): string[] {
  let roots: string[]
  try {
    const fullTask = getAgentTask(task.id)
    roots = fullTask
      ? resolveTaskEventLogRoots(fullTask)
      : [task.workspaceRoot?.trim() || getDefaultTaskRuntimeDir(task.id)]
  } catch {
    roots = [task.workspaceRoot?.trim() || getDefaultTaskRuntimeDir(task.id)]
  }
  const lines: string[] = []

  for (const root of roots) {
    const logPath = getTaskEventLogPath({ id: task.id, workspaceRoot: root })
    if (!existsSync(logPath)) continue
    lines.push(
      ...readFileSync(logPath, 'utf8')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
    )
  }

  return lines
}

function clearTaskEventLogAllLocations(task: AgentTask): void {
  for (const root of resolveTaskEventLogRoots(task)) {
    clearTaskEventLog({ id: task.id, workspaceRoot: root })
  }
}

export function listTaskEvents(input: unknown): TaskEventListOutput {
  const data = TaskEventListInputSchema.parse(input)
  const existing = getAgentTask(data.taskId)
  if (!existing) {
    throw new Error('任务不存在')
  }

  const task = repairTaskWorkspaceRecord(existing)
  const limit = data.limit ?? 100
  return { items: readTaskEventsFromLog(task, limit) }
}

export function clearTaskEvents(input: unknown): { cleared: true } {
  const data = TaskEventClearInputSchema.parse(input)
  const existing = getAgentTask(data.taskId)
  if (!existing) {
    throw new Error('任务不存在')
  }

  clearTaskEventLogAllLocations(existing)
  return { cleared: true }
}
