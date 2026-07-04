import type { TaskTokenBudget } from './types.js'

/** Task-level step failure retries before marking the task failed (MVP). */
export const TASK_MAX_RETRY_COUNT = 3

export function isTaskBudgetExhausted(budget: TaskTokenBudget): boolean {
  return budget.used.total >= budget.maxTotalTokens
}

export function isTaskRetryLimitReached(retryCount: number): boolean {
  return retryCount >= TASK_MAX_RETRY_COUNT
}
