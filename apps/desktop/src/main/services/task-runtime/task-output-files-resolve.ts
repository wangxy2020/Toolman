import { existsSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'

import type { AgentTask } from '@toolman/shared'

import { resolveTaskToolAbsolutePath } from './task-tool-path-utils'
import { getTaskWorkspacePaths, resolveTaskToolWorkingDirectory } from './task-workspace.service'

export function resolveTaskOutputFilePath(
  task: Pick<AgentTask, 'id' | 'workspaceRoot' | 'assistantId' | 'workspaceId'>,
  candidate: string,
): string | null {
  const trimmed = candidate.trim()
  if (!trimmed || trimmed.includes('..')) return null

  const workingDirectory = resolveTaskToolWorkingDirectory(task)
  const { filesDir, taskRoot } = getTaskWorkspacePaths(task)
  const resolved = isAbsolute(trimmed)
    ? trimmed
    : resolveTaskToolAbsolutePath(trimmed, workingDirectory)

  if (existsSync(resolved)) {
    return resolved
  }

  for (const base of [filesDir, taskRoot]) {
    const fallback = resolve(base, trimmed)
    if (existsSync(fallback)) {
      return fallback
    }
  }

  return null
}
