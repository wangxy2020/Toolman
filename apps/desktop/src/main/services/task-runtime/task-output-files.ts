import { existsSync, readdirSync, statSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'

import {
  isTaskToolStepRecord,
  parseTaskToolStepInput,
  type AgentTask,
} from '@toolman/shared'

import { listTaskArtifacts } from './artifact.service'
import { resolveTaskToolAbsolutePath } from './task-tool-path-utils'
import { getTaskWorkspacePaths, resolveTaskToolWorkingDirectory } from './task-workspace.service'

export const OUTPUT_FILE_PATTERN = /\.(xlsx|xls|csv|docx|doc|pdf|md|txt)$/i

/** Mtime heuristic: only likely task exports, not pre-existing docx/pdf in the folder. */
const RECENT_OUTPUT_FILE_PATTERN = /\.(xlsx|xls|csv|md|txt)$/i

const FS_WRITE_OUTPUT_RE = /已写入文件:\s*(.+)\s*$/m
const FS_EDIT_OUTPUT_RE = /已(?:更新|追加内容到)文件:\s*(.+)\s*$/m

function resolveToolBaseName(toolName: string): string {
  return (toolName.includes('__') ? toolName.split('__').pop() : toolName)?.toLowerCase() ?? toolName.toLowerCase()
}

function readStepOutputText(output: unknown): string {
  if (!output || typeof output !== 'object' || Array.isArray(output)) return ''
  const text = (output as { text?: unknown }).text
  return typeof text === 'string' ? text : ''
}

function parseToolArgs(argsJson: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(argsJson) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    return null
  } catch {
    return null
  }
}

export function isTaskOutputWriteTool(toolName: string): boolean {
  const base = resolveToolBaseName(toolName)
  if (base === 'fs_write' || base === 'fs_edit') return true

  const lower = toolName.toLowerCase()
  if (/(?:^|__)read_/.test(lower)) return false
  if (/modify_excel|highlight_excel|write_excel|create_excel|save_excel|export_excel/.test(lower)) {
    return true
  }
  if (/write_document|update_document|save_document/.test(lower)) return true
  return false
}

function parseJsonOutputPaths(output: string): string[] {
  const jsonStart = output.indexOf('{')
  const jsonEnd = output.lastIndexOf('}')
  if (jsonStart === -1 || jsonEnd <= jsonStart) return []

  try {
    const parsed = JSON.parse(output.slice(jsonStart, jsonEnd + 1)) as {
      targetPath?: unknown
      outputPath?: unknown
    }
    const paths: string[] = []
    if (typeof parsed.targetPath === 'string' && parsed.targetPath.trim()) {
      paths.push(parsed.targetPath.trim())
    } else if (typeof parsed.outputPath === 'string' && parsed.outputPath.trim()) {
      paths.push(parsed.outputPath.trim())
    }
    return paths
  } catch {
    return []
  }
}

function extractPathsFromWriteToolOutput(output: string): string[] {
  const paths = new Set<string>()

  for (const pattern of [FS_WRITE_OUTPUT_RE, FS_EDIT_OUTPUT_RE]) {
    const match = output.match(pattern)
    if (match?.[1]) paths.add(match[1].trim())
  }

  for (const path of parseJsonOutputPaths(output)) {
    paths.add(path)
  }

  return [...paths]
}

export function extractTaskToolOutputPathsFromArgs(toolName: string, argsJson: string): string[] {
  const args = parseToolArgs(argsJson)
  if (!args) return []

  const lower = toolName.toLowerCase()
  if (/modify_excel|highlight_excel/.test(lower)) {
    const outputPath = args.outputPath ?? args.output_path
    if (typeof outputPath === 'string' && outputPath.trim()) {
      return [outputPath.trim()]
    }
    const filePath = args.filePath ?? args.file_path ?? args.path
    if (typeof filePath === 'string' && filePath.trim()) {
      return [filePath.trim()]
    }
    return []
  }

  const base = resolveToolBaseName(toolName)
  if (base === 'fs_write' || base === 'fs_edit') {
    const path = args.path
    return typeof path === 'string' && path.trim() ? [path.trim()] : []
  }

  for (const key of ['outputPath', 'output_path', 'path', 'filePath', 'file_path', 'target']) {
    const value = args[key]
    if (typeof value === 'string' && value.trim()) {
      return [value.trim()]
    }
  }

  return []
}

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

function extractOutputPathFromBashArgs(argsJson: string): string | null {
  const args = parseToolArgs(argsJson)
  if (!args) return null
  const command = typeof args.command === 'string' ? args.command : ''
  const match = command.match(/out\s*=\s*['"]([^'"]+)['"]/)
  return match?.[1]?.trim() ?? null
}

function collectTaskArtifactOutputPaths(task: AgentTask): string[] {
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

export function extractFileCandidatesFromText(text: string): string[] {
  const candidates = new Set<string>()
  const trimmed = text.trim()
  if (!trimmed) return []

  const patterns = [
    /[`'"]?([^\s`'"，,。]+\.(?:xlsx?|csv|docx?|pdf|txt|md))[`'"]?/gi,
    /(?:写入|保存|保存位置|生成|导出|创建了|输出到|written to|saved to|created)[：:\s]+[`'"]?([^\s`'"，,。]+)/gi,
    /(?:保存位置|路径)[：:\s]+([^\s`'"，,。]+)/gi,
  ]

  for (const pattern of patterns) {
    for (const match of trimmed.matchAll(pattern)) {
      const candidate = match[1]?.trim()
      if (candidate && OUTPUT_FILE_PATTERN.test(candidate)) {
        candidates.add(candidate)
      }
    }
  }

  return [...candidates]
}

function collectOutputPathsFromTaskProse(task: AgentTask): string[] {
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

function extractPathsFromBashOutput(output: string): string[] {
  const paths = new Set<string>()
  for (const line of output.split('\n')) {
    for (const match of line.matchAll(/([^\s`'"，,；;]+\.(?:xlsx?|csv|docx?|pdf|txt|md))/gi)) {
      const candidate = match[1]?.trim()
      if (candidate) paths.add(candidate)
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
function collectRecentWorkspaceOutputPaths(task: AgentTask): string[] {
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

function sortTaskOutputPaths(task: AgentTask, paths: string[]): string[] {
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

/** Prefer tool/artifact outputs; avoid mtime/prose false positives when history exists. */
export function resolveTaskOutputFileLinks(task: AgentTask): string[] {
  const paths = new Set<string>()

  for (const path of collectTaskOutputPathsFromHistory(task)) {
    paths.add(path)
  }
  for (const path of collectTaskArtifactOutputPaths(task)) {
    paths.add(path)
  }

  if (paths.size === 0) {
    for (const path of collectOutputPathsFromTaskProse(task)) {
      paths.add(path)
    }
    for (const path of collectRecentWorkspaceOutputPaths(task)) {
      paths.add(path)
    }
  }

  return sortTaskOutputPaths(task, [...paths])
}

export function discoverTaskOutputFilePaths(task: AgentTask): string[] {
  return resolveTaskOutputFileLinks(task)
}
