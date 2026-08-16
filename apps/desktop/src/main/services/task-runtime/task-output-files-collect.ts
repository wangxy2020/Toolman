import { existsSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  isTaskToolStepRecord,
  parseTaskToolStepInput,
  type AgentTask,
} from '@toolman/shared'

import { listTaskArtifacts } from './artifact.service'
import { getTaskWorkspacePaths, resolveTaskToolWorkingDirectory } from './task-workspace.service'
import {
  OUTPUT_FILE_PATTERN,
  extractFileCandidatesFromText,
  extractOutputPathFromBashArgs,
  extractPathsFromBashOutput,
  extractPathsFromWriteToolOutput,
  extractTaskToolOutputPathsFromArgs,
  isTaskOutputWriteTool,
  readStepOutputText,
  resolveToolBaseName,
} from './task-output-files-extract'
import { resolveTaskOutputFilePath } from './task-output-files-resolve'

/** Mtime heuristic: only likely task exports, not pre-existing docx/pdf in the folder. */
const RECENT_OUTPUT_FILE_PATTERN = /\.(xlsx|xls|csv|md|txt)$/i

export function collectTaskArtifactOutputPaths(task: AgentTask): string[] {
  const paths = new Set<string>()
  for (const artifact of listTaskArtifacts({ taskId: task.id }).items) {
    const absolutePath = artifact.absolutePath?.trim()
    if (absolutePath && existsSync(absolutePath)) {
      paths.add(absolutePath)
    }
  }
  return [...paths]
}

export function collectTaskOutputPathsFromHistory(task: AgentTask): string[] {
  const paths = new Set<string>()

  for (const step of task.history) {
    if (step.status !== 'completed' || !isTaskToolStepRecord(step)) continue

    try {
      const payload = parseTaskToolStepInput(step.input)
      const base = resolveToolBaseName(payload.toolName)
      const isWrite = isTaskOutputWriteTool(payload.toolName)
      const isBash = base === 'bash'

      if (!isWrite && !isBash) continue

      const outputText = readStepOutputText(step.output)
      for (const raw of extractPathsFromWriteToolOutput(outputText)) {
        const resolved = resolveTaskOutputFilePath(task, raw)
        if (resolved && OUTPUT_FILE_PATTERN.test(resolved)) {
          paths.add(resolved)
        }
      }

      if (isBash) {
        for (const raw of extractPathsFromBashOutput(outputText)) {
          const resolved = resolveTaskOutputFilePath(task, raw)
          if (resolved && OUTPUT_FILE_PATTERN.test(resolved)) {
            paths.add(resolved)
          }
        }
        const fromArgs = extractOutputPathFromBashArgs(payload.argsJson)
        if (fromArgs) {
          const resolved = resolveTaskOutputFilePath(task, fromArgs)
          if (resolved && OUTPUT_FILE_PATTERN.test(resolved)) {
            paths.add(resolved)
          }
        }
      }

      if (isWrite) {
        for (const raw of extractTaskToolOutputPathsFromArgs(payload.toolName, payload.argsJson)) {
          const resolved = resolveTaskOutputFilePath(task, raw)
          if (resolved && OUTPUT_FILE_PATTERN.test(resolved)) {
            paths.add(resolved)
          }
        }
      }
    } catch {
      // skip malformed tool steps
    }
  }

  return [...paths]
}

export function collectOutputPathsFromTaskProse(task: AgentTask): string[] {
  const texts: string[] = []
  const reflection = task.metadata?.lastReflection
  if (reflection && typeof reflection === 'object' && !Array.isArray(reflection)) {
    const record = reflection as Record<string, unknown>
    if (typeof record.summary === 'string') texts.push(record.summary)
    if (typeof record.reason === 'string') texts.push(record.reason)
  }

  for (const key of ['executorFailureReason', 'stageGateFailureReason', 'orchestratorFailureReason'] as const) {
    const value = task.metadata?.[key]
    if (typeof value === 'string' && value.trim()) {
      texts.push(value)
    }
  }

  if (task.notes?.trim()) texts.push(task.notes)

  const paths = new Set<string>()
  for (const text of texts) {
    for (const candidate of extractFileCandidatesFromText(text)) {
      const resolved = resolveTaskOutputFilePath(task, candidate)
      if (resolved && OUTPUT_FILE_PATTERN.test(resolved)) {
        paths.add(resolved)
      }
    }
  }

  return [...paths]
}

function scanDirForRecentFiles(
  dir: string,
  windowStart: number,
  windowEnd: number,
  paths: Set<string>,
  depth: number,
): void {
  if (depth > 2 || !existsSync(dir)) return

  let entries: string[] = []
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }

  for (const entry of entries) {
    if (entry.startsWith('.')) continue

    const fullPath = resolve(dir, entry)
    let stat: ReturnType<typeof statSync>
    try {
      stat = statSync(fullPath)
    } catch {
      continue
    }

    if (stat.isDirectory()) {
      scanDirForRecentFiles(fullPath, windowStart, windowEnd, paths, depth + 1)
      continue
    }

    if (!stat.isFile() || !RECENT_OUTPUT_FILE_PATTERN.test(entry)) continue
    if (stat.mtimeMs >= windowStart && stat.mtimeMs <= windowEnd) {
      paths.add(fullPath)
    }
  }
}

export function collectRecentWorkspaceOutputPaths(task: AgentTask): string[] {
  const paths = new Set<string>()
  const workingDirectory = resolveTaskToolWorkingDirectory(task)
  const { filesDir, subdirs } = getTaskWorkspacePaths(task)
  const scanDirs = [workingDirectory, filesDir, subdirs.files, subdirs.artifacts]
  const windowStart = task.createdAt - 5_000
  const windowEnd = Math.max(task.updatedAt, Date.now()) + 5_000

  for (const dir of scanDirs) {
    scanDirForRecentFiles(dir, windowStart, windowEnd, paths, 0)
  }

  return [...paths]
}

export function sortTaskOutputPaths(task: AgentTask, paths: string[]): string[] {
  const workingDirectory = resolveTaskToolWorkingDirectory(task)
  return [...new Set(paths)].sort((left, right) => {
    const leftInWorkingDir = left.startsWith(workingDirectory)
    const rightInWorkingDir = right.startsWith(workingDirectory)
    if (leftInWorkingDir !== rightInWorkingDir) {
      return leftInWorkingDir ? -1 : 1
    }
    return left.localeCompare(right, 'zh-CN')
  })
}
