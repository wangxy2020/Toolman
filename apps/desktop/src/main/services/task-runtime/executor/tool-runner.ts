import { existsSync } from 'node:fs'

import { toErrorMessage } from '@toolman/shared'
import {
  computeRetryBackoffMs,
  resolveTaskToolExecutionPolicy,
  type AgentTask,
} from '@toolman/shared'

import { executeToolCall } from '../../tool-executor.service'
import type { ToolExecutionContext } from '../../tool-executor/types'
import {
  cleanupTaskToolCheckpoint,
  createTaskToolCheckpoint,
  rollbackTaskToolCheckpoint,
  type TaskToolCheckpoint,
} from './checkpoint'
import { registerTaskArtifact } from '../artifact.service'
import {
  extractTaskToolOutputPathsFromArgs,
  isTaskOutputWriteTool,
  resolveTaskOutputFilePath,
} from '../task-output-files'
import { absolutizeTaskMcpToolArgs } from '../task-tool-path-utils'
import {
  emitTaskCheckpoint,
  emitTaskRetry,
  emitTaskToolFinished,
  emitTaskToolStarted,
} from '../task-event.service'

export interface TaskToolRunOptions {
  task?: AgentTask
  stepId?: string
  toolCallId?: string
  signal?: AbortSignal
}

export interface TaskToolRunResult {
  output: string
  attempts: number
  elapsedMs: number
  policy: ReturnType<typeof resolveTaskToolExecutionPolicy>
  rolledBack?: boolean
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parseJsonOutputPath(output: string): string | undefined {
  const jsonStart = output.indexOf('{')
  const jsonEnd = output.lastIndexOf('}')
  if (jsonStart === -1 || jsonEnd <= jsonStart) return undefined

  try {
    const parsed = JSON.parse(output.slice(jsonStart, jsonEnd + 1)) as {
      targetPath?: unknown
      outputPath?: unknown
    }
    if (typeof parsed.targetPath === 'string' && parsed.targetPath.trim()) {
      return parsed.targetPath.trim()
    }
    if (typeof parsed.outputPath === 'string' && parsed.outputPath.trim()) {
      return parsed.outputPath.trim()
    }
  } catch {
    return undefined
  }

  return undefined
}

function maybeRegisterTaskArtifactFromTool(
  task: AgentTask,
  toolName: string,
  argsJson: string,
  output: string,
): void {
  if (!isTaskOutputWriteTool(toolName)) return

  const candidates = new Set<string>()
  const writeMatch = output.match(/已写入文件:\s*(.+)\s*$/m)
  if (writeMatch?.[1]) candidates.add(writeMatch[1].trim())

  const editMatch = output.match(/已(?:更新|追加内容到)文件:\s*(.+)\s*$/m)
  if (editMatch?.[1]) candidates.add(editMatch[1].trim())

  const jsonPath = parseJsonOutputPath(output)
  if (jsonPath) candidates.add(jsonPath)

  for (const raw of extractTaskToolOutputPathsFromArgs(toolName, argsJson)) {
    candidates.add(raw)
  }

  for (const candidate of candidates) {
    if (!/\.(?:xlsx?|csv|docx?|pdf|txt|md)$/i.test(candidate)) continue

    const resolved = resolveTaskOutputFilePath(task, candidate)
    if (!resolved || !existsSync(resolved)) continue

    try {
      registerTaskArtifact({
        taskId: task.id,
        sourcePath: resolved,
        source: 'tool',
        copy: false,
      })
    } catch {
      // Best-effort artifact registration.
    }
  }
}

async function executeWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) {
    throw new Error('工具执行已取消')
  }

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`工具执行超时（${timeoutMs}ms）`))
    }, timeoutMs)

    const onAbort = () => {
      clearTimeout(timer)
      reject(new Error('工具执行已取消'))
    }

    signal?.addEventListener('abort', onAbort, { once: true })

    fn()
      .then((value) => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
        resolve(value)
      })
      .catch((error) => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
        reject(error)
      })
  })
}

export async function runTaskTool(
  toolName: string,
  argsJson: string,
  context: ToolExecutionContext,
  options: TaskToolRunOptions = {},
): Promise<TaskToolRunResult> {
  const policy = resolveTaskToolExecutionPolicy(toolName)
  const task = options.task
  const startedAt = Date.now()
  let lastError: string | undefined
  let checkpoint: TaskToolCheckpoint | null = null

  if (task && policy.rollbackEligible) {
    checkpoint = createTaskToolCheckpoint({
      task,
      toolName,
      argsJson,
      context,
      checkpointId: options.toolCallId,
    })
    if (checkpoint) {
      emitTaskCheckpoint(task, {
        stepId: options.stepId,
        checkpointPath: checkpoint.dir,
      })
    }
  }

  try {
    for (let attempt = 0; attempt < policy.maxRetries; attempt++) {
      if (attempt > 0) {
        if (task) {
          emitTaskRetry(task, {
            stepId: options.stepId,
            retryCount: attempt,
            reason: lastError,
          })
        }
        await sleep(computeRetryBackoffMs(attempt))
      }

      if (task) {
        emitTaskToolStarted(task, {
          stepId: options.stepId,
          toolName,
          toolCallId: options.toolCallId,
        })
      }

      try {
        const workingDirectory = context.workingDirectory ?? ''
        const resolvedArgsJson = workingDirectory
          ? absolutizeTaskMcpToolArgs(toolName, argsJson, workingDirectory)
          : argsJson

        const output = await executeWithTimeout(
          () => executeToolCall(toolName, resolvedArgsJson, context),
          policy.timeoutMs,
          options.signal,
        )

        if (task) {
          maybeRegisterTaskArtifactFromTool(task, toolName, resolvedArgsJson, output)
          emitTaskToolFinished(task, {
            stepId: options.stepId,
            toolName,
            toolCallId: options.toolCallId,
            success: true,
          })
        }

        if (checkpoint) {
          cleanupTaskToolCheckpoint(checkpoint)
          checkpoint = null
        }

        return {
          output,
          attempts: attempt + 1,
          elapsedMs: Date.now() - startedAt,
          policy,
        }
      } catch (error) {
        lastError = toErrorMessage(error, '工具执行失败')
        if (attempt >= policy.maxRetries - 1) {
          if (task) {
            emitTaskToolFinished(task, {
              stepId: options.stepId,
              toolName,
              toolCallId: options.toolCallId,
              success: false,
              error: lastError,
            })
          }
          throw new Error(lastError)
        }
      }
    }

    throw new Error(lastError ?? '工具执行失败')
  } catch (error) {
    if (checkpoint) {
      rollbackTaskToolCheckpoint(checkpoint)
      checkpoint = null
      const base = toErrorMessage(error, '工具执行失败')
      throw new Error(`${base}（已回滚文件变更）`)
    }
    throw error
  } finally {
    if (checkpoint) {
      cleanupTaskToolCheckpoint(checkpoint)
    }
  }
}
