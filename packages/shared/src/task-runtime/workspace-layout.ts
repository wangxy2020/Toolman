export const TASK_WORKSPACE_LAYOUT_VERSION = 1 as const

/** Subdirectories under each task workspace root (see docs/agent-task-runtime.md §11). */
export const TASK_WORKSPACE_SUBDIRS = [
  'files',
  'artifacts',
  'cache',
  'temp',
  'logs',
  'checkpoints',
] as const

export type TaskWorkspaceSubdir = (typeof TASK_WORKSPACE_SUBDIRS)[number]

export const TASK_WORKSPACE_METADATA_LAYOUT_KEY = 'workspaceLayoutVersion'

export function joinTaskWorkspaceSubdir(taskRoot: string, subdir: TaskWorkspaceSubdir): string {
  const root = taskRoot.replace(/[/\\]+$/, '')
  return `${root}/${subdir}`
}

export function taskFilesDirFromRoot(taskRoot: string): string {
  return joinTaskWorkspaceSubdir(taskRoot, 'files')
}

export function taskSnapshotPathFromRoot(taskRoot: string): string {
  const root = taskRoot.replace(/[/\\]+$/, '')
  return `${root}/task.json`
}
