import type { ToolExecutionContext } from '../../tool-executor/types'

export class ExecutorError extends Error {
  constructor(
    message: string,
    readonly code: 'NOT_FOUND' | 'LOCK_HELD' | 'INVALID_STATE' | 'STEP_FAILED',
  ) {
    super(message)
    this.name = 'ExecutorError'
  }
}

export interface TaskExecutorOptions {
  workerId?: string
  signal?: AbortSignal
  toolContext?: Partial<ToolExecutionContext>
  /**
   * Stage-gate reflection after tool steps.
   * - default / true: reflect only after the last pending tool step
   * - 'each': reflect after every tool step (legacy)
   * - false: skip reflection
   */
  reflectAfterStep?: boolean | 'each'
}
