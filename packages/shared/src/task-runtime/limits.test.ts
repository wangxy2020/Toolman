import { describe, expect, it } from 'vitest'

import { createDefaultTaskTokenBudget } from './token-budget.js'
import { isTaskBudgetExhausted, isTaskRetryLimitReached, TASK_MAX_RETRY_COUNT } from './limits.js'

describe('task runtime limits', () => {
  it('defines max retry count as 3', () => {
    expect(TASK_MAX_RETRY_COUNT).toBe(3)
  })

  it('detects budget exhaustion', () => {
    const budget = createDefaultTaskTokenBudget('network')
    expect(isTaskBudgetExhausted(budget)).toBe(false)

    budget.used.total = budget.maxTotalTokens
    expect(isTaskBudgetExhausted(budget)).toBe(true)
  })

  it('detects retry limit', () => {
    expect(isTaskRetryLimitReached(0)).toBe(false)
    expect(isTaskRetryLimitReached(2)).toBe(false)
    expect(isTaskRetryLimitReached(3)).toBe(true)
  })
})
