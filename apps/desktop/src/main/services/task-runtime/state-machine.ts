import type { TaskStatus } from '@toolman/shared'

export const TASK_PAUSED_FROM_STATUS_KEY = 'pausedFromStatus'

export const TASK_PAUSABLE_STATUSES: readonly TaskStatus[] = [
  'pending',
  'planning',
  'executing',
  'reflecting',
  'retrying',
] as const

export const TASK_TERMINAL_STATUSES: readonly TaskStatus[] = [
  'completed',
  'failed',
  'cancelled',
] as const

export class TaskStateError extends Error {
  constructor(
    message: string,
    readonly code: 'INVALID_TRANSITION' | 'NOT_FOUND' | 'ALREADY_TERMINAL',
  ) {
    super(message)
    this.name = 'TaskStateError'
  }
}

export function isPausableTaskStatus(status: TaskStatus): boolean {
  return (TASK_PAUSABLE_STATUSES as readonly string[]).includes(status)
}

export function isTerminalTaskStatus(status: TaskStatus): boolean {
  return (TASK_TERMINAL_STATUSES as readonly string[]).includes(status)
}

export function assertTaskPauseTransition(status: TaskStatus): void {
  if (status === 'paused') {
    throw new TaskStateError('任务已处于暂停状态', 'INVALID_TRANSITION')
  }
  if (isTerminalTaskStatus(status)) {
    throw new TaskStateError('已结束的任务无法暂停', 'ALREADY_TERMINAL')
  }
  if (!isPausableTaskStatus(status)) {
    throw new TaskStateError(`当前状态 ${status} 不可暂停`, 'INVALID_TRANSITION')
  }
}

export function assertTaskResumeTransition(status: TaskStatus): void {
  if (status !== 'paused') {
    throw new TaskStateError('只有暂停中的任务可以恢复', 'INVALID_TRANSITION')
  }
}

export function assertTaskCancelTransition(status: TaskStatus): void {
  if (isTerminalTaskStatus(status)) {
    throw new TaskStateError('任务已结束', 'ALREADY_TERMINAL')
  }
}

export function resolveResumeTaskStatus(
  pausedFromStatus: TaskStatus | undefined,
): TaskStatus {
  if (pausedFromStatus && isPausableTaskStatus(pausedFromStatus)) {
    return pausedFromStatus
  }
  return 'pending'
}
