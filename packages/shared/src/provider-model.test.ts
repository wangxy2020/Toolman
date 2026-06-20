import { describe, expect, it } from 'vitest'
import {
  enrichProviderModel,
  getDefaultModelTypes,
  getDisplayModelTypes,
  getModelTypeSupport,
  isOcrVisionModelId,
  normalizeModelTypes,
} from './provider-model.js'

describe('getModelTypeSupport', () => {
  it('classifies glm-ocr as vision-only', () => {
    for (const modelId of ['glm-ocr', 'glm-ocr:0.9b', 'glm_ocr']) {
      expect(getModelTypeSupport(modelId)).toEqual({
        vision: true,
        web: false,
        reasoning: false,
        tools: false,
        rerank: false,
        embedding: false,
      })
    }
  })

  it('keeps glm-4v as vision chat model with tools', () => {
    const support = getModelTypeSupport('glm-4v')
    expect(support.vision).toBe(true)
    expect(support.tools).toBe(true)
  })
})

describe('normalizeModelTypes', () => {
  it('resets saved tool flags for glm-ocr models', () => {
    expect(
      normalizeModelTypes('glm-ocr:0.9b', {
        vision: false,
        tools: true,
      }),
    ).toEqual(getDefaultModelTypes('glm-ocr:0.9b'))
  })
})

describe('enrichProviderModel', () => {
  it('shows glm-ocr under vision category after enrichment', () => {
    const model = enrichProviderModel({
      id: 'glm-ocr:0.9b',
      name: 'glm-ocr:0.9b',
      types: { tools: true },
    })

    expect(getDisplayModelTypes(model)).toEqual({
      vision: true,
      web: false,
      reasoning: false,
      tools: false,
      rerank: false,
      embedding: false,
    })
  })
})

describe('isOcrVisionModelId', () => {
  it('matches glm-ocr variants', () => {
    expect(isOcrVisionModelId('glm-ocr:latest')).toBe(true)
    expect(isOcrVisionModelId('glm_ocr')).toBe(true)
    expect(isOcrVisionModelId('glm-4v')).toBe(false)
  })
})
