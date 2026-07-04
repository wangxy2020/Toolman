import { toErrorMessage, IpcChannel, ipcOk, ipcErr, TaskRunInputSchema, isTerminalTaskStatus, TaskReleaseSessionBindingInputSchema } from '@toolman/shared'

import {
  controlTask,
  createTask,
  getTask,
  listTasks,
  releaseSessionTaskBinding,
  TaskStateError,
} from '../services/task-runtime/task-runtime.service'
import { ExecutorError, runTaskExecutor } from '../services/task-runtime/executor/executor.service'
import { PlannerError, runTaskPlanner } from '../services/task-runtime/planner/planner.service'
import {
  OrchestratorError,
} from '../services/task-runtime/orchestrator/orchestrator.service'
import { scheduleTaskRun } from '../services/task-runtime/task-queue/task-queue.service'
import { ReflectionError, runTaskReflection } from '../services/task-runtime/reflection/reflection.service'
import {
  deleteTaskArtifact,
  getTaskArtifact,
  listTaskArtifacts,
  registerTaskArtifact,
} from '../services/task-runtime/artifact.service'
import { clearTaskEvents, listTaskEvents } from '../services/task-runtime/task-event.service'
import { clearStaleTerminalSessionBinding } from '../services/task-runtime/session-bind'
import { broadcastSessionMessagesReload } from '../services/stream-broadcast'
import type { HandlerFn } from './handlers/ipc-handler-map/types'

function mapTaskError(error: unknown) {
  if (error instanceof ExecutorError) {
    if (error.code === 'NOT_FOUND') {
      return ipcErr({ code: 'NOT_FOUND', message: error.message, retryable: false })
    }
    if (error.code === 'LOCK_HELD' || error.code === 'INVALID_STATE') {
      return ipcErr({ code: 'CONFLICT', message: error.message, retryable: false })
    }
    if (error.code === 'STEP_FAILED') {
      return ipcErr({ code: 'INTERNAL_ERROR', message: error.message, retryable: true })
    }
  }

  if (error instanceof PlannerError) {
    if (error.code === 'NOT_FOUND') {
      return ipcErr({ code: 'NOT_FOUND', message: error.message, retryable: false })
    }
    if (error.code === 'LOCK_HELD' || error.code === 'INVALID_STATE') {
      return ipcErr({ code: 'CONFLICT', message: error.message, retryable: false })
    }
    if (error.code === 'MODEL_UNAVAILABLE' || error.code === 'PLAN_PARSE_FAILED') {
      return ipcErr({ code: 'INTERNAL_ERROR', message: error.message, retryable: true })
    }
  }

  if (error instanceof ReflectionError) {
    if (error.code === 'NOT_FOUND') {
      return ipcErr({ code: 'NOT_FOUND', message: error.message, retryable: false })
    }
    if (error.code === 'LOCK_HELD' || error.code === 'INVALID_STATE') {
      return ipcErr({ code: 'CONFLICT', message: error.message, retryable: false })
    }
    if (error.code === 'MODEL_UNAVAILABLE' || error.code === 'REFLECTION_PARSE_FAILED') {
      return ipcErr({ code: 'INTERNAL_ERROR', message: error.message, retryable: true })
    }
  }

  if (error instanceof OrchestratorError) {
    if (error.code === 'NOT_FOUND') {
      return ipcErr({ code: 'NOT_FOUND', message: error.message, retryable: false })
    }
    if (error.code === 'INVALID_STATE' || error.code === 'LOOP_LIMIT') {
      return ipcErr({ code: 'CONFLICT', message: error.message, retryable: false })
    }
    if (error.code === 'BUDGET_EXHAUSTED') {
      return ipcErr({ code: 'INTERNAL_ERROR', message: error.message, retryable: false })
    }
  }

  if (error instanceof TaskStateError) {
    if (error.code === 'NOT_FOUND') {
      return ipcErr({ code: 'NOT_FOUND', message: error.message, retryable: false })
    }
    if (error.code === 'ALREADY_TERMINAL') {
      return ipcErr({ code: 'CONFLICT', message: error.message, retryable: false })
    }
    return ipcErr({ code: 'CONFLICT', message: error.message, retryable: false })
  }

  const message = toErrorMessage(error, 'Task operation failed')
  if (message.includes('不存在') || message.includes('not found')) {
    return ipcErr({ code: 'NOT_FOUND', message, retryable: false })
  }
  return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
}

export const taskIpcHandlers: Partial<Record<IpcChannel, HandlerFn>> = {
  [IpcChannel.TaskCreate]: async (input) => {
    try {
      return ipcOk(createTask(input))
    } catch (error) {
      return mapTaskError(error)
    }
  },

  [IpcChannel.TaskGet]: async (input) => {
    try {
      const task = getTask(input)
      if (!task) {
        return ipcErr({ code: 'NOT_FOUND', message: '任务不存在', retryable: false })
      }
      if (task.sessionId && isTerminalTaskStatus(task.status)) {
        if (clearStaleTerminalSessionBinding(task.sessionId)) {
          broadcastSessionMessagesReload(task.sessionId)
        }
      }
      return ipcOk(task)
    } catch (error) {
      return mapTaskError(error)
    }
  },

  [IpcChannel.TaskList]: async (input) => {
    try {
      return ipcOk(listTasks(input))
    } catch (error) {
      return mapTaskError(error)
    }
  },

  [IpcChannel.TaskControl]: async (input) => {
    try {
      return ipcOk(controlTask(input))
    } catch (error) {
      return mapTaskError(error)
    }
  },

  [IpcChannel.TaskReleaseSessionBinding]: async (input) => {
    try {
      const result = releaseSessionTaskBinding(input)
      if (result.released) {
        const data = TaskReleaseSessionBindingInputSchema.parse(input)
        broadcastSessionMessagesReload(data.sessionId)
      }
      return ipcOk(result)
    } catch (error) {
      return mapTaskError(error)
    }
  },

  [IpcChannel.TaskArtifactRegister]: async (input) => {
    try {
      const artifact = registerTaskArtifact(input)
      return ipcOk({ artifact })
    } catch (error) {
      return mapTaskError(error)
    }
  },

  [IpcChannel.TaskArtifactList]: async (input) => {
    try {
      return ipcOk(listTaskArtifacts(input))
    } catch (error) {
      return mapTaskError(error)
    }
  },

  [IpcChannel.TaskArtifactGet]: async (input) => {
    try {
      const artifact = getTaskArtifact(input)
      if (!artifact) {
        return ipcErr({ code: 'NOT_FOUND', message: '产物不存在', retryable: false })
      }
      return ipcOk(artifact)
    } catch (error) {
      return mapTaskError(error)
    }
  },

  [IpcChannel.TaskArtifactDelete]: async (input) => {
    try {
      return ipcOk(deleteTaskArtifact(input))
    } catch (error) {
      return mapTaskError(error)
    }
  },

  [IpcChannel.TaskEventList]: async (input) => {
    try {
      return ipcOk(listTaskEvents(input))
    } catch (error) {
      return mapTaskError(error)
    }
  },

  [IpcChannel.TaskEventClear]: async (input) => {
    try {
      return ipcOk(clearTaskEvents(input))
    } catch (error) {
      return mapTaskError(error)
    }
  },

  [IpcChannel.TaskExecute]: async (input) => {
    try {
      const task = await runTaskExecutor(input)
      return ipcOk({ task })
    } catch (error) {
      return mapTaskError(error)
    }
  },

  [IpcChannel.TaskPlan]: async (input) => {
    try {
      const task = await runTaskPlanner(input)
      return ipcOk({ task })
    } catch (error) {
      return mapTaskError(error)
    }
  },

  [IpcChannel.TaskReflect]: async (input) => {
    try {
      const result = await runTaskReflection(input)
      return ipcOk(result)
    } catch (error) {
      return mapTaskError(error)
    }
  },

  [IpcChannel.TaskRun]: async (input) => {
    try {
      const data = TaskRunInputSchema.parse(input)
      const task = await scheduleTaskRun(data.taskId, {
        workerId: data.workerId,
        skipPlan: data.skipPlan,
      })
      return ipcOk({ task })
    } catch (error) {
      return mapTaskError(error)
    }
  },
}
