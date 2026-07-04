import { describe, expect, it } from 'vitest'

import {
  createTaskTokenBudgetForModel,
  inferTaskTokenBudgetPreset,
  legacyTaskStatusToTaskStatus,
  taskStatusToLegacyStatus,
  TASK_TOKEN_BUDGET_LOCAL,
  TASK_TOKEN_BUDGET_NETWORK,
} from './index.js'

describe('task-runtime token budget', () => {
  it('uses local preset for ollama models', () => {
    expect(inferTaskTokenBudgetPreset('ollama:gemma3:12b')).toBe('local')
    const budget = createTaskTokenBudgetForModel('ollama:gemma3:12b')
    expect(budget.maxTotalTokens).toBe(TASK_TOKEN_BUDGET_LOCAL.maxTotalTokens)
  })

  it('uses network preset for cloud models', () => {
    expect(inferTaskTokenBudgetPreset('openai:gpt-4o')).toBe('network')
    const budget = createTaskTokenBudgetForModel('openai:gpt-4o')
    expect(budget.maxTotalTokens).toBe(TASK_TOKEN_BUDGET_NETWORK.maxTotalTokens)
  })
})

describe('legacy task status mapping', () => {
  it('maps in_progress to executing', () => {
    expect(legacyTaskStatusToTaskStatus('in_progress')).toBe('executing')
  })

  it('maps active task statuses back to in_progress for legacy tools', () => {
    expect(taskStatusToLegacyStatus('planning')).toBe('in_progress')
    expect(taskStatusToLegacyStatus('executing')).toBe('in_progress')
    expect(taskStatusToLegacyStatus('failed')).toBe('in_progress')
  })
})
