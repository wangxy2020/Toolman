import {
  normalizeReflectionVerdict,
  type AgentTask,
  type TaskReflectionResult,
} from '@toolman/shared'

export class ReflectionError extends Error {
  constructor(
    message: string,
    readonly code: 'NOT_FOUND' | 'LOCK_HELD' | 'INVALID_STATE' | 'MODEL_UNAVAILABLE' | 'REFLECTION_PARSE_FAILED',
  ) {
    super(message)
    this.name = 'ReflectionError'
  }
}

export interface TaskReflectionOptions {
  workerId?: string
  signal?: AbortSignal
  stepId?: string
}

export interface TaskReflectionOutput {
  task: AgentTask
  reflection: TaskReflectionResult
  verdict: ReturnType<typeof normalizeReflectionVerdict>
}
