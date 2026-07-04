import { join } from 'node:path'
import { app } from 'electron'

export const TASK_RUNTIME_ROOT_DIR = 'toolman/tasks'

export function getTaskRuntimeRootDir(): string {
  return join(app.getPath('userData'), TASK_RUNTIME_ROOT_DIR)
}

/** Default per-task runtime root under userData (used when no assistant working directory). */
export function getDefaultTaskRuntimeDir(taskId: string): string {
  return join(getTaskRuntimeRootDir(), taskId)
}

/** @deprecated Use getDefaultTaskRuntimeDir or task.workspaceRoot */
export function getTaskWorkspaceDir(taskId: string): string {
  return getDefaultTaskRuntimeDir(taskId)
}

export function getTaskSnapshotPath(taskId: string): string {
  return join(getDefaultTaskRuntimeDir(taskId), 'task.json')
}

/** Legacy flat JSON per assistant (pre-T01). */
export function getLegacyAgentTasksDir(): string {
  return join(app.getPath('userData'), 'agent-tasks')
}

export function getLegacyAgentTasksPath(assistantId: string): string {
  return join(getLegacyAgentTasksDir(), `${assistantId}.json`)
}
