import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { TASK_EVENT_LOG_FILE, type AgentTask, type TaskEvent } from '@toolman/shared'

import { ensureTaskWorkspaceLayout, getTaskWorkspacePaths } from './task-workspace.service'

export function getTaskEventLogPath(task: Pick<AgentTask, 'id' | 'workspaceRoot'>): string {
  const { subdirs } = getTaskWorkspacePaths(task)
  return join(subdirs.logs, TASK_EVENT_LOG_FILE)
}

export function clearTaskEventLog(task: Pick<AgentTask, 'id' | 'workspaceRoot'>): void {
  const logPath = getTaskEventLogPath(task)
  mkdirSync(join(logPath, '..'), { recursive: true })
  writeFileSync(logPath, '', 'utf8')
}

export function appendTaskEventLog(
  task: Pick<AgentTask, 'id' | 'workspaceRoot'>,
  event: TaskEvent,
): void {
  ensureTaskWorkspaceLayout(getTaskWorkspacePaths(task).taskRoot)
  const logPath = getTaskEventLogPath(task)
  mkdirSync(join(logPath, '..'), { recursive: true })
  appendFileSync(logPath, `${JSON.stringify(event)}\n`, 'utf8')
}
