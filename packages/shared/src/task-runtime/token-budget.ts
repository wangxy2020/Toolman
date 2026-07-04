import type { TaskTokenBudget, TaskTokenBudgetPreset } from './types.js'
import { TaskTokenBudgetSchema } from './types.js'

export const TASK_TOKEN_BUDGET_LOCAL = {
  maxPlannerTokens: 32_000,
  maxExecutorTokensPerStep: 16_000,
  maxReflectionTokens: 8_000,
  maxTotalTokens: 500_000,
  maxSteps: 50,
} as const

export const TASK_TOKEN_BUDGET_NETWORK = {
  maxPlannerTokens: 8_000,
  maxExecutorTokensPerStep: 4_000,
  maxReflectionTokens: 4_000,
  maxTotalTokens: 120_000,
  maxSteps: 30,
} as const

export function parseModelProviderId(modelId: string | undefined | null): string | null {
  const trimmed = modelId?.trim()
  if (!trimmed) return null
  const sep = trimmed.indexOf(':')
  if (sep <= 0) return null
  return trimmed.slice(0, sep).toLowerCase()
}

/** Local inference (Ollama) → larger budgets; cloud APIs → medium. */
export function inferTaskTokenBudgetPreset(modelId: string | undefined | null): TaskTokenBudgetPreset {
  const provider = parseModelProviderId(modelId)
  if (provider === 'ollama') {
    return 'local'
  }
  return 'network'
}

export function createDefaultTaskTokenBudget(
  preset: TaskTokenBudgetPreset = 'network',
  overrides?: Partial<
    Pick<
      TaskTokenBudget,
      | 'maxPlannerTokens'
      | 'maxExecutorTokensPerStep'
      | 'maxReflectionTokens'
      | 'maxTotalTokens'
      | 'maxSteps'
    >
  >,
): TaskTokenBudget {
  const base = preset === 'local' ? TASK_TOKEN_BUDGET_LOCAL : TASK_TOKEN_BUDGET_NETWORK
  return TaskTokenBudgetSchema.parse({
    preset,
    ...base,
    ...overrides,
    used: {
      planner: 0,
      executor: 0,
      reflection: 0,
      total: 0,
    },
  })
}

export function createTaskTokenBudgetForModel(
  modelId: string | undefined | null,
  overrides?: Partial<
    Pick<
      TaskTokenBudget,
      | 'preset'
      | 'maxPlannerTokens'
      | 'maxExecutorTokensPerStep'
      | 'maxReflectionTokens'
      | 'maxTotalTokens'
      | 'maxSteps'
    >
  >,
): TaskTokenBudget {
  const preset = overrides?.preset ?? inferTaskTokenBudgetPreset(modelId)
  const { preset: _ignored, ...rest } = overrides ?? {}
  return createDefaultTaskTokenBudget(preset, rest)
}
