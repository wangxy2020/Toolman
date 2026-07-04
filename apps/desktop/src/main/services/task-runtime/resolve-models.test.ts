import { describe, expect, it, vi } from 'vitest'

vi.mock('../assistant.service', () => ({
  getAssistantRow: vi.fn(),
}))

vi.mock('../provider/crud', () => ({
  getProviderRow: vi.fn(),
}))

vi.mock('../runtime-app-settings.service', () => ({
  resolvePlannerModelIdFromRuntime: vi.fn(() => null),
}))

import { getAssistantRow } from '../assistant.service'
import { getProviderRow } from '../provider/crud'
import { resolvePlannerModelIdFromRuntime } from '../runtime-app-settings.service'
import {
  inferTaskBudgetPresetForModels,
  isLocalInferenceModelId,
  resolveTaskPlannerModelCandidates,
  resolveTaskPlannerModelId,
} from './resolve-models'

describe('resolve-models', () => {
  it('detects ollama provider type from model id', () => {
    vi.mocked(getProviderRow).mockReturnValue({
      type: 'ollama',
    } as never)

    expect(isLocalInferenceModelId('00000000-0000-0000-0000-000000000004:gemma4:latest')).toBe(true)
    expect(inferTaskBudgetPresetForModels('00000000-0000-0000-0000-000000000004:gemma4:latest')).toBe('local')
  })

  it('prefers assistant chat model over global planner setting', () => {
    vi.mocked(resolvePlannerModelIdFromRuntime).mockReturnValue('cloud-provider:gpt-4o')
    vi.mocked(getAssistantRow).mockReturnValue({
      id: 'assistant-1',
      modelId: '00000000-0000-0000-0000-000000000004:gemma4:latest',
      parametersJson: '{}',
    } as never)

    expect(resolveTaskPlannerModelId({ assistantId: 'assistant-1' })).toBe(
      '00000000-0000-0000-0000-000000000004:gemma4:latest',
    )
    expect(resolveTaskPlannerModelCandidates({ assistantId: 'assistant-1' })).toEqual([
      '00000000-0000-0000-0000-000000000004:gemma4:latest',
      'cloud-provider:gpt-4o',
    ])
  })

  it('falls back to global planner when chat model already listed', () => {
    vi.mocked(resolvePlannerModelIdFromRuntime).mockReturnValue('cloud-provider:gpt-4o')
    vi.mocked(getAssistantRow).mockReturnValue({
      id: 'assistant-1',
      modelId: '00000000-0000-0000-0000-000000000004:gemma4:latest',
      parametersJson: '{}',
    } as never)

    expect(
      resolveTaskPlannerModelCandidates({
        assistantId: 'assistant-1',
        explicitPlannerModelId: '00000000-0000-0000-0000-000000000004:gemma4:latest',
      }),
    ).toEqual(['00000000-0000-0000-0000-000000000004:gemma4:latest', 'cloud-provider:gpt-4o'])
  })
})
