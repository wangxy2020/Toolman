import { describe, expect, it } from 'vitest'
import type { KnowledgeBase, Provider } from '@toolman/shared'
import { resolveKnowledgeAnalysisModelId } from './resolve-knowledge-analysis-model'

function provider(id: string, models: string[]): Provider {
  return {
    id,
    workspaceId: 'ws',
    type: id === 'ollama' ? 'ollama' : 'openai',
    name: id,
    baseUrl: '',
    apiKey: null,
    hasApiKey: false,
    isEnabled: true,
    createdAt: 1,
    updatedAt: 1,
    models: models.map((modelId) => ({
      id: modelId,
      name: modelId,
      isEmbedding: false,
      isRerank: false,
    })),
  } as Provider
}

describe('resolveKnowledgeAnalysisModelId', () => {
  const providers = [
    provider('deepseek', ['deepseek-v4-flash']),
    provider('ollama', ['gemma4:26b']),
  ]

  it('uses configured analysis model when available', () => {
    const kb = {
      embedConfig: { analysisModelId: 'ollama:gemma4:26b' },
    } as KnowledgeBase
    expect(resolveKnowledgeAnalysisModelId(kb, providers)).toBe('ollama:gemma4:26b')
  })

  it('returns null when unset (does not fall back to first chat model)', () => {
    const kb = { embedConfig: {} } as KnowledgeBase
    expect(resolveKnowledgeAnalysisModelId(kb, providers)).toBeNull()
  })

  it('returns null when kb is missing', () => {
    expect(resolveKnowledgeAnalysisModelId(null, providers)).toBeNull()
    expect(resolveKnowledgeAnalysisModelId(undefined, providers)).toBeNull()
  })

  it('returns null when configured model is unavailable', () => {
    const kb = {
      embedConfig: { analysisModelId: 'missing:model' },
    } as KnowledgeBase
    expect(resolveKnowledgeAnalysisModelId(kb, providers)).toBeNull()
  })
})
