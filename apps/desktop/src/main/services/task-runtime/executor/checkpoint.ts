import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative, resolve, isAbsolute } from 'node:path'
import { randomUUID } from 'node:crypto'

import {
  extractTaskToolTargetPaths,
  resolveTaskToolExecutionPolicy,
  type AgentTask,
} from '@toolman/shared'

import { sandboxFor } from '../../tool-executor/types'
import type { ToolExecutionContext } from '../../tool-executor/types'
import { getTaskWorkspacePaths, resolveTaskToolWorkingDirectory } from '../task-workspace.service'

export interface TaskCheckpointEntry {
  targetPath: string
  backupFile: string | null
  existed: boolean
}

export interface TaskCheckpointManifest {
  version: 1
  id: string
  taskId: string
  toolName: string
  createdAt: number
  entries: TaskCheckpointEntry[]
}

export interface TaskToolCheckpoint {
  id: string
  dir: string
  manifest: TaskCheckpointManifest
}

function isPathInsideRoot(targetPath: string, rootPath: string): boolean {
  const rootReal = existsSync(rootPath) ? realpathSync.native(rootPath) : resolve(rootPath)
  const targetResolved = resolve(targetPath)
  const targetReal = existsSync(targetResolved)
    ? realpathSync.native(targetResolved)
    : targetResolved
  const rel = relative(rootReal, targetReal)
  return !rel.startsWith('..') && !isAbsolute(rel)
}

function resolveSandboxForTask(
  task: Pick<AgentTask, 'id' | 'workspaceRoot' | 'assistantId' | 'workspaceId'>,
  context: ToolExecutionContext,
): ReturnType<typeof sandboxFor> {
  return sandboxFor({
    ...context,
    workingDirectory: context.workingDirectory ?? resolveTaskToolWorkingDirectory(task),
  })
}

export function createTaskToolCheckpoint(options: {
  task: Pick<AgentTask, 'id' | 'workspaceRoot' | 'assistantId' | 'workspaceId'>
  toolName: string
  argsJson: string
  context: ToolExecutionContext
  checkpointId?: string
}): TaskToolCheckpoint | null {
  const policy = resolveTaskToolExecutionPolicy(options.toolName)
  if (!policy.rollbackEligible) return null

  const pathArgs = extractTaskToolTargetPaths(options.toolName, options.argsJson)
  if (pathArgs.length === 0) return null

  const workspace = getTaskWorkspacePaths(options.task)
  const sandbox = resolveSandboxForTask(options.task, options.context)
  const checkpointId = options.checkpointId ?? randomUUID()
  const checkpointDir = join(workspace.subdirs.checkpoints, checkpointId)
  const dataDir = join(checkpointDir, 'data')
  mkdirSync(dataDir, { recursive: true })

  const entries: TaskCheckpointEntry[] = []

  for (let index = 0; index < pathArgs.length; index++) {
    const pathArg = pathArgs[index]!
    let targetPath: string
    try {
      targetPath = sandbox.resolveInside(pathArg)
    } catch {
      continue
    }

    if (!isPathInsideRoot(targetPath, workspace.taskRoot)) {
      continue
    }

    const existed = existsSync(targetPath)
    if (existed) {
      const stat = statSync(targetPath)
      if (!stat.isFile()) {
        continue
      }
    }

    const backupFile = `data/${index}`
    const backupPath = join(checkpointDir, backupFile)
    if (existed) {
      copyFileSync(targetPath, backupPath)
    }

    entries.push({
      targetPath,
      backupFile: existed ? backupFile : null,
      existed,
    })
  }

  if (entries.length === 0) {
    rmSync(checkpointDir, { recursive: true, force: true })
    return null
  }

  const manifest: TaskCheckpointManifest = {
    version: 1,
    id: checkpointId,
    taskId: options.task.id,
    toolName: options.toolName,
    createdAt: Date.now(),
    entries,
  }

  writeFileSync(join(checkpointDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')

  return {
    id: checkpointId,
    dir: checkpointDir,
    manifest,
  }
}

export function rollbackTaskToolCheckpoint(checkpoint: TaskToolCheckpoint): void {
  const manifest =
    checkpoint.manifest ??
    (JSON.parse(readFileSync(join(checkpoint.dir, 'manifest.json'), 'utf8')) as TaskCheckpointManifest)

  for (const entry of manifest.entries) {
    if (entry.existed) {
      if (!entry.backupFile) continue
      const backupPath = join(checkpoint.dir, entry.backupFile)
      if (!existsSync(backupPath)) continue
      mkdirSync(dirname(entry.targetPath), { recursive: true })
      copyFileSync(backupPath, entry.targetPath)
      continue
    }

    if (existsSync(entry.targetPath)) {
      const stat = statSync(entry.targetPath)
      if (stat.isFile()) {
        unlinkSync(entry.targetPath)
      }
    }
  }
}

export function cleanupTaskToolCheckpoint(checkpoint: TaskToolCheckpoint): void {
  rmSync(checkpoint.dir, { recursive: true, force: true })
}
