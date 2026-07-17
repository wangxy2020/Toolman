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

/** Legacy flat JSON per assistant (pre-T01). */
export function getLegacyAgentTasksDir(): string {
  return join(app.getPath('userData'), 'agent-tasks')
}

export function getLegacyAgentTasksPath(assistantId: string): string {
  return join(getLegacyAgentTasksDir(), `${assistantId}.json`)
}
