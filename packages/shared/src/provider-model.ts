import type { ProviderModel } from './ipc/agent.js'

export type ModelTypeKey = 'vision' | 'web' | 'reasoning' | 'tools' | 'rerank' | 'embedding'

export interface ModelTypeState {
  vision: boolean
  web: boolean
  reasoning: boolean
  tools: boolean
  rerank: boolean
  embedding: boolean
}

const EMBEDDING_MODEL = /bge-m3|(?:^|[^a-z])embed(?!.*rerank)|nomic-embed|text-embedding/i
const VISION_MODEL =
  /vision|vl-|vl_|4o|gemini.*vision|llava|minicpm-v|qwen.*vl|gpt-4o|gpt-4-turbo|claude-3|glm-4v/i
const REASONING_MODEL =
  /o1|o3|reason|r1|think|deepseek-reasoner|qwen3|gemma|deepseek-r|o\d-/i
const TOOL_MODEL = /gpt-|claude|gemma|qwen|deepseek|moonshot|glm|chat|instruct|sonnet|haiku|opus/i
const RERANK_MODEL = /rerank|bge-reranker/i
const WEB_MODEL = /search|online|browse/i

/** 模型本身支持配置的能力（不可超出此范围） */
export function getModelTypeSupport(modelId: string): ModelTypeState {
  const id = modelId.toLowerCase()

  if (RERANK_MODEL.test(id)) {
    return {
      vision: false,
      web: false,
      reasoning: false,
      tools: false,
      rerank: true,
      embedding: false,
    }
  }

  if (EMBEDDING_MODEL.test(id) || /^bge-/.test(id)) {
    return {
      vision: false,
      web: false,
      reasoning: false,
      tools: false,
      rerank: false,
      embedding: true,
    }
  }

  return {
    vision: VISION_MODEL.test(id) || /gemma|qwen/i.test(id),
    web: WEB_MODEL.test(id),
    reasoning: REASONING_MODEL.test(id),
    tools: TOOL_MODEL.test(id) || !WEB_MODEL.test(id),
    rerank: false,
    embedding: false,
  }
}

export function getDefaultModelTypes(modelId: string): ModelTypeState {
  const support = getModelTypeSupport(modelId)

  if (support.embedding) {
    return {
      vision: false,
      web: false,
      reasoning: false,
      tools: false,
      rerank: false,
      embedding: true,
    }
  }

  if (support.rerank) {
    return {
      vision: false,
      web: false,
      reasoning: false,
      tools: false,
      rerank: true,
      embedding: false,
    }
  }

  return {
    vision: support.vision,
    web: support.web,
    reasoning: support.reasoning,
    tools: support.tools,
    rerank: false,
    embedding: false,
  }
}

export function normalizeModelTypes(modelId: string, types: Partial<ModelTypeState>): ModelTypeState {
  const support = getModelTypeSupport(modelId)
  const next: ModelTypeState = {
    vision: Boolean(types.vision) && support.vision,
    web: Boolean(types.web) && support.web,
    reasoning: Boolean(types.reasoning) && support.reasoning,
    tools: Boolean(types.tools) && support.tools,
    rerank: Boolean(types.rerank) && support.rerank,
    embedding: Boolean(types.embedding) && support.embedding,
  }

  if (support.embedding && !support.tools && !support.vision && !support.reasoning) {
    return getDefaultModelTypes(modelId)
  }

  if (support.rerank && !support.embedding) {
    return { vision: false, web: false, reasoning: false, tools: false, rerank: true, embedding: false }
  }

  if (next.embedding) {
    return getDefaultModelTypes(modelId)
  }

  return next
}

export function hasSavedModelTypes(types: ProviderModel['types'] | undefined): boolean {
  if (!types) return false
  return Object.values(types).some(Boolean)
}

export function getDisplayModelTypes(model: Pick<ProviderModel, 'id' | 'types'>): ModelTypeState {
  if (hasSavedModelTypes(model.types)) {
    return normalizeModelTypes(model.id, model.types!)
  }
  return getDefaultModelTypes(model.id)
}

export function inferModelGroup(modelId: string, group?: string): string {
  if (group?.trim()) return group.trim()
  const colon = modelId.indexOf(':')
  if (colon > 0) return modelId.slice(0, colon)
  return modelId.split(/[-_]/)[0] || modelId
}

export function enrichProviderModel(
  model: Pick<ProviderModel, 'id' | 'name'> & Partial<ProviderModel>,
): ProviderModel {
  const defaults = getDefaultModelTypes(model.id)
  const types = hasSavedModelTypes(model.types)
    ? normalizeModelTypes(model.id, { ...defaults, ...model.types })
    : defaults

  return {
    id: model.id,
    name: model.name || model.id,
    group: model.group ?? inferModelGroup(model.id),
    types,
    incrementalOutput:
      model.incrementalOutput ?? (!types.embedding && !types.rerank),
    currency: model.currency ?? 'USD',
    inputPrice: model.inputPrice ?? 0,
  }
}

export function isChatModelEntry(model: Pick<ProviderModel, 'id' | 'types'>): boolean {
  const types = getDisplayModelTypes(model)
  return !types.embedding && !types.rerank
}

export function isEmbeddingModelId(modelId: string): boolean {
  return getModelTypeSupport(modelId).embedding
}
