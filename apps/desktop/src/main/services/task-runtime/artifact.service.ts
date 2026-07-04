import { copyFileSync, existsSync, lstatSync, realpathSync } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'

import {
  TaskArtifactDeleteInputSchema,
  TaskArtifactGetInputSchema,
  TaskArtifactListInputSchema,
  TaskArtifactRegisterInputSchema,
  guessMimeTypeFromFileName,
  inferTaskArtifactKind,
  sanitizeArtifactFileName,
  type TaskArtifact,
  type TaskArtifactListOutput,
} from '@toolman/shared'
import { AgentTaskArtifactRepository } from '@toolman/db'

import { getDatabase } from '../../bootstrap/database'
import { getAgentTask, repairTaskWorkspaceRecord } from './store'
import { getTaskWorkspacePaths, resolveTaskToolWorkingDirectory } from './task-workspace.service'
import { emitTaskArtifactCreated } from './task-event.service'

function getArtifactRepo(): AgentTaskArtifactRepository {
  return new AgentTaskArtifactRepository(getDatabase())
}

function isPathInside(root: string, target: string): boolean {
  const rel = relative(resolve(root), resolve(target))
  return rel === '' || (!rel.startsWith('..') && !rel.startsWith('/'))
}

function resolveUniqueRelativePath(
  repo: AgentTaskArtifactRepository,
  taskId: string,
  fileName: string,
): string {
  const safeName = sanitizeArtifactFileName(fileName)
  let candidate = safeName
  let index = 2

  while (repo.findActiveByRelativePath(taskId, candidate)) {
    const dot = safeName.lastIndexOf('.')
    const stem = dot > 0 ? safeName.slice(0, dot) : safeName
    const ext = dot > 0 ? safeName.slice(dot) : ''
    candidate = `${stem}-${index}${ext}`
    index += 1
  }

  return candidate
}

export function registerTaskArtifact(input: unknown): TaskArtifact {
  const data = TaskArtifactRegisterInputSchema.parse(input)
  let task = getAgentTask(data.taskId)
  if (!task) {
    throw new Error('任务不存在')
  }
  task = repairTaskWorkspaceRecord(task)

  const sourcePath = resolve(data.sourcePath.trim())
  if (!existsSync(sourcePath)) {
    throw new Error('源文件不存在')
  }

  const sourceStat = lstatSync(sourcePath)
  if (!sourceStat.isFile()) {
    throw new Error('只能注册文件产物')
  }

  const sourceReal = realpathSync.native(sourcePath)
  const { taskRoot, subdirs } = getTaskWorkspacePaths(task)
  const artifactsDir = resolve(subdirs.artifacts)
  const workingDirectory = resolve(resolveTaskToolWorkingDirectory(task))
  const repo = getArtifactRepo()

  const displayName = data.name?.trim() || sanitizeArtifactFileName(basename(sourcePath))
  const alreadyInArtifacts = isPathInside(artifactsDir, sourceReal)
  const insideTaskRoot = isPathInside(taskRoot, sourceReal)
  const insideWorkingDirectory = isPathInside(workingDirectory, sourceReal)
  const shouldCopy = data.copy ?? !alreadyInArtifacts

  let absolutePath = sourceReal
  let relativePath: string

  if (alreadyInArtifacts) {
    relativePath = relative(artifactsDir, sourceReal).replace(/\\/g, '/')
  } else if (shouldCopy) {
    relativePath = resolveUniqueRelativePath(repo, task.id, basename(sourceReal))
    absolutePath = join(artifactsDir, relativePath)
    copyFileSync(sourceReal, absolutePath)
  } else if (insideTaskRoot || insideWorkingDirectory) {
    relativePath = insideTaskRoot
      ? relative(resolve(taskRoot), sourceReal).replace(/\\/g, '/')
      : relative(workingDirectory, sourceReal).replace(/\\/g, '/')
    absolutePath = sourceReal
  } else {
    throw new Error('源文件不在任务工作区或智能体工作目录内，请启用 copy 或先将文件放入可访问目录')
  }

  const finalStat = lstatSync(absolutePath)
  const mimeType = guessMimeTypeFromFileName(displayName)
  const kind = data.kind ?? inferTaskArtifactKind(displayName, mimeType)

  const artifact = repo.create({
    taskId: task.id,
    name: displayName,
    kind,
    relativePath,
    absolutePath,
    mimeType,
    sizeBytes: finalStat.size,
    source: data.source,
    metadata: data.metadata,
  })

  emitTaskArtifactCreated(task, artifact)
  return artifact
}

export function listTaskArtifacts(input: unknown): TaskArtifactListOutput {
  const data = TaskArtifactListInputSchema.parse(input)
  const task = getAgentTask(data.taskId)
  if (!task) {
    throw new Error('任务不存在')
  }

  const limit = data.pagination?.limit ?? 100
  const items = getArtifactRepo().listByTask(task.id, limit)
  return { items }
}

export function getTaskArtifact(input: unknown): TaskArtifact | null {
  const data = TaskArtifactGetInputSchema.parse(input)
  return getArtifactRepo().getByTaskAndId(data.taskId, data.artifactId)
}

export function deleteTaskArtifact(input: unknown): { deleted: boolean } {
  const data = TaskArtifactDeleteInputSchema.parse(input)
  const task = getAgentTask(data.taskId)
  if (!task) {
    throw new Error('任务不存在')
  }

  const deleted = getArtifactRepo().softDelete(task.id, data.artifactId)
  return { deleted }
}
