import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  TASK_WORKSPACE_LAYOUT_VERSION,
  TASK_WORKSPACE_METADATA_LAYOUT_KEY,
  TASK_WORKSPACE_SUBDIRS,
  type AgentTask,
  type TaskWorkspaceSubdir,
  joinTaskWorkspaceSubdir,
  taskFilesDirFromRoot,
  taskSnapshotPathFromRoot,
} from '@toolman/shared'
import { AssistantParametersSchema } from '@toolman/shared'

import { resolveAssistantWorkingDirectory } from '../agent-runtime'
import { getAssistantRow } from '../assistant.service'
import { resolveWorkingDirectory } from '../permission.service'
import { getDefaultTaskRuntimeDir, getTaskRuntimeRootDir } from './paths'
import { parseAssistantParametersJson } from './resolve-models'

export interface TaskWorkspacePaths {
  taskRoot: string
  filesDir: string
  snapshotPath: string
  subdirs: Record<TaskWorkspaceSubdir, string>
}

export function resolveTaskWorkspaceRootPath(options: {
  taskId: string
  explicitWorkspaceRoot?: string
  assistantId?: string
}): string {
  const explicit = options.explicitWorkspaceRoot?.trim()
  if (explicit) {
    return explicit
  }

  if (options.assistantId) {
    const assistant = getAssistantRow(options.assistantId)
    if (assistant) {
      const params = AssistantParametersSchema.safeParse(
        parseAssistantParametersJson(assistant.parametersJson),
      )
      const workingDirectory = params.success ? params.data.workingDirectory?.trim() : undefined
      if (workingDirectory) {
        return join(workingDirectory, '.toolman', 'tasks', options.taskId)
      }
    }
  }

  return getDefaultTaskRuntimeDir(options.taskId)
}

export function ensureTaskWorkspaceLayout(taskRoot: string): string {
  mkdirSync(taskRoot, { recursive: true })

  for (const subdir of TASK_WORKSPACE_SUBDIRS) {
    const dir = joinTaskWorkspaceSubdir(taskRoot, subdir)
    mkdirSync(dir, { recursive: true })
    const keepFile = join(dir, '.gitkeep')
    if (!existsSync(keepFile)) {
      writeFileSync(keepFile, '', 'utf8')
    }
  }

  return taskRoot
}

export function getTaskWorkspacePaths(task: Pick<AgentTask, 'id' | 'workspaceRoot'>): TaskWorkspacePaths {
  const taskRoot = task.workspaceRoot?.trim() || getDefaultTaskRuntimeDir(task.id)
  const subdirs = Object.fromEntries(
    TASK_WORKSPACE_SUBDIRS.map((subdir) => [subdir, joinTaskWorkspaceSubdir(taskRoot, subdir)]),
  ) as Record<TaskWorkspaceSubdir, string>

  return {
    taskRoot,
    filesDir: taskFilesDirFromRoot(taskRoot),
    snapshotPath: taskSnapshotPathFromRoot(taskRoot),
    subdirs,
  }
}

export function getTaskFilesDir(task: Pick<AgentTask, 'id' | 'workspaceRoot'>): string {
  return getTaskWorkspacePaths(task).filesDir
}

/** Tool sandbox root for task execution — matches L1 chat (assistant / workspace folder). */
export const TASK_RESOLVED_WORKING_DIRECTORY_KEY = 'resolvedWorkingDirectory'
export const TASK_WORKING_DIRECTORY_WARNING_KEY = 'taskWorkingDirectoryWarning'

/** User-visible working directory from assistant or workspace settings (not internal sandbox). */
export function resolveTaskUserWorkingDirectory(
  task: Pick<AgentTask, 'assistantId' | 'workspaceId' | 'id' | 'workspaceRoot'>,
): string | undefined {
  if (task.assistantId) {
    const assistant = getAssistantRow(task.assistantId)
    const configured = resolveAssistantWorkingDirectory(assistant, task.workspaceId)
    if (configured) {
      return resolveWorkingDirectory(configured)
    }
  }
  return undefined
}

export function isTaskUsingInternalToolSandbox(
  task: Pick<AgentTask, 'assistantId' | 'workspaceId' | 'id' | 'workspaceRoot'>,
): boolean {
  return !resolveTaskUserWorkingDirectory(task)
}

export function buildTaskWorkingDirectoryMetadata(
  task: Pick<AgentTask, 'assistantId' | 'workspaceId' | 'id' | 'workspaceRoot'>,
): Record<string, string> {
  const resolved = resolveTaskToolWorkingDirectory(task)
  const metadata: Record<string, string> = {
    [TASK_RESOLVED_WORKING_DIRECTORY_KEY]: resolved,
  }
  if (isTaskUsingInternalToolSandbox(task)) {
    metadata[TASK_WORKING_DIRECTORY_WARNING_KEY] =
      '未设置智能体工作目录或工作区文件夹，工具将在内部任务沙箱中执行，生成文件可能不易找到。'
  }
  return metadata
}

/** Tool sandbox root for task execution — matches L1 chat (assistant / workspace folder). */
export function resolveTaskToolWorkingDirectory(
  task: Pick<AgentTask, 'id' | 'workspaceRoot' | 'assistantId' | 'workspaceId'>,
): string {
  if (task.assistantId) {
    const assistant = getAssistantRow(task.assistantId)
    const configured = resolveAssistantWorkingDirectory(assistant, task.workspaceId)
    if (configured) {
      return resolveWorkingDirectory(configured)
    }
  }
  return resolveWorkingDirectory(getTaskFilesDir(task))
}

export function buildTaskWorkspacePatch(
  task: AgentTask,
  options?: {
    explicitWorkspaceRoot?: string
    assistantId?: string
  },
): { taskRoot: string; workspaceRoot: string; metadata: Record<string, unknown> } | null {
  const taskRoot = resolveTaskWorkspaceRootPath({
    taskId: task.id,
    explicitWorkspaceRoot: options?.explicitWorkspaceRoot ?? task.workspaceRoot,
    assistantId: options?.assistantId ?? task.assistantId,
  })

  ensureTaskWorkspaceLayout(taskRoot)

  const layoutVersion = task.metadata[TASK_WORKSPACE_METADATA_LAYOUT_KEY]
  const needsUpdate =
    task.workspaceRoot !== taskRoot ||
    layoutVersion !== TASK_WORKSPACE_LAYOUT_VERSION

  if (!needsUpdate) {
    return null
  }

  return {
    taskRoot,
    workspaceRoot: taskRoot,
    metadata: {
      ...task.metadata,
      [TASK_WORKSPACE_METADATA_LAYOUT_KEY]: TASK_WORKSPACE_LAYOUT_VERSION,
    },
  }
}

/** @deprecated Prefer getDefaultTaskRuntimeDir(taskId) */
export function getLegacyTaskRuntimeDir(taskId: string): string {
  return join(getTaskRuntimeRootDir(), taskId)
}
