import { createModelGateway } from '@toolman/model-gateway'
import {
  KnowledgeEmbedConfigSchema,
  DEFAULT_KNOWLEDGE_EMBED_CONFIG,
  enrichProviderModel,
  getModelTypeSupport,
  isOcrVisionModelId,
  type ProviderModel,
} from '@toolman/shared'
import { getKnowledgeBaseRepository } from '../db/repos'
import {
  getProviderConfig,
  getProviderRow,
  isChatModelId,
  listProviders,
} from './provider.service'
import { resolveWorkspaceDocProcessorContext } from './workspace-doc-processor.service'

export const gateway = createModelGateway()

export const OCR_SYSTEM_PROMPT = `You are a high-accuracy OCR engine for document page images.
Extract ALL visible text exactly as printed, including Chinese, English, numbers, punctuation, and symbols.
Preserve paragraph breaks, line breaks, table rows, headers, footers, stamps, and list structure.
For tables, keep rows on separate lines and separate columns with tabs when possible.
Do not summarize, translate, explain, or wrap the output in markdown.
If a small region is completely unreadable, write [无法识别] for that region only.`

export function buildOcrUserPrompt(pageNumber: number, totalPages: number): string {
  return `请逐字提取第 ${pageNumber}/${totalPages} 页图片中的全部可见文字，只输出识别结果，不要添加任何说明。`
}

export const KNOWLEDGE_MAX_OCR_PAGES = 200
export const CHAT_OCR_MAX_PAGES = 10
export const OCR_PAGE_TIMEOUT_MS = 5 * 60 * 1000
export const CHAT_OCR_PAGE_TIMEOUT_MS = 2 * 60 * 1000

export interface ResolvedOcrVisionModel {
  providerId: string
  providerType: NonNullable<ReturnType<typeof getProviderConfig>>['type']
  modelId: string
}

type OcrModelResolveOptions = {
  /** Only dedicated OCR models such as glm-ocr. */
  ocrOnly?: boolean
  /** Skip models already tried (e.g. after glm-ocr failed). */
  excludeModelIds?: string[]
}

const ocrVisionModelCache = new Map<string, ResolvedOcrVisionModel | null>()

function cacheKey(
  workspaceId: string,
  kbId: string | undefined,
  options?: OcrModelResolveOptions,
): string {
  const exclude = (options?.excludeModelIds ?? []).slice().sort().join(',')
  return `${workspaceId}::${kbId ?? ''}::ocrOnly=${options?.ocrOnly ? 1 : 0}::ex=${exclude}`
}

export function getCachedOcrVisionModel(
  workspaceId: string,
  kbId?: string,
  options?: OcrModelResolveOptions,
): ResolvedOcrVisionModel | null {
  const key = cacheKey(workspaceId, kbId, options)
  if (ocrVisionModelCache.has(key)) {
    return ocrVisionModelCache.get(key) ?? null
  }
  const resolved = resolveOcrVisionModelUncached(workspaceId, kbId, options)
  ocrVisionModelCache.set(key, resolved)
  return resolved
}

function parseEmbedConfig(embedConfigJson: string) {
  try {
    return KnowledgeEmbedConfigSchema.parse(JSON.parse(embedConfigJson))
  } catch {
    return DEFAULT_KNOWLEDGE_EMBED_CONFIG
  }
}

/** Dedicated OCR / VL models — prefer over chat models that only match broad name heuristics. */
const STRICT_VISION_MODEL =
  /vision|vl-|vl_|llava|minicpm-v|qwen.*vl|gpt-4o|gpt-4-turbo|claude-3|glm-4v|glm[-_]ocr/i

function isVisionModel(model: ProviderModel): boolean {
  if (!isChatModelId(model.id)) return false
  const enriched = enrichProviderModel(model)
  const support = getModelTypeSupport(model.id)
  return Boolean(enriched.types?.vision ?? support.vision)
}

function isStrictVisionModelId(modelId: string): boolean {
  return isOcrVisionModelId(modelId) || STRICT_VISION_MODEL.test(modelId.toLowerCase())
}

/**
 * Prefer dedicated OCR models (glm-ocr), then real VL models, then any vision-tagged model.
 * Avoids picking text chat models like qwen3.5:9b / gemma4 that only match broad name heuristics.
 */
export function pickOcrVisionModelId(models: ProviderModel[]): string | null {
  const candidates = models.filter(isVisionModel)
  if (candidates.length === 0) return null

  const ocr = candidates.find((model) => isOcrVisionModelId(model.id))
  if (ocr) return ocr.id

  const strict = candidates.find((model) => isStrictVisionModelId(model.id))
  if (strict) return strict.id

  return candidates[0]?.id ?? null
}

function resolveOcrVisionModelUncached(
  workspaceId: string,
  kbId?: string,
  options?: OcrModelResolveOptions,
): ResolvedOcrVisionModel | null {
  let preferredProviderId: string | null = null
  const exclude = new Set(
    (options?.excludeModelIds ?? []).map((id) => id.trim().toLowerCase()).filter(Boolean),
  )

  if (kbId) {
    const kb = getKnowledgeBaseRepository().findRowById(kbId, workspaceId)
    const embedConfig = kb ? parseEmbedConfig(kb.embedConfigJson) : DEFAULT_KNOWLEDGE_EMBED_CONFIG
    preferredProviderId = embedConfig.docProcessorProviderId ?? null
  } else {
    preferredProviderId = resolveWorkspaceDocProcessorContext(workspaceId).providerId
  }

  const tryProvider = (
    providerId: string,
    preferOcrOnly: boolean,
  ): ResolvedOcrVisionModel | null => {
    const row = getProviderRow(providerId)
    if (!row || !row.isEnabled || row.workspaceId !== workspaceId) return null
    const config = getProviderConfig(providerId)
    if (!config) return null
    const models = (JSON.parse(row.modelsJson) as ProviderModel[])
      .map((model) => enrichProviderModel(model))
      .filter((model) => !exclude.has(model.id.trim().toLowerCase()))
    const modelId = preferOcrOnly
      ? models.find((model) => isVisionModel(model) && isOcrVisionModelId(model.id))?.id ?? null
      : pickOcrVisionModelId(models.filter((model) => !isOcrVisionModelId(model.id)))
    if (!modelId) return null
    return { providerId, providerType: config.type, modelId }
  }

  const providerList = listProviders({ workspaceId, enabledOnly: true })
  const orderedProviderIds = [
    ...(preferredProviderId ? [preferredProviderId] : []),
    ...providerList.map((provider) => provider.id).filter((id) => id !== preferredProviderId),
  ]

  if (options?.ocrOnly) {
    for (const providerId of orderedProviderIds) {
      const resolved = tryProvider(providerId, true)
      if (resolved) return resolved
    }
    return null
  }

  // Dedicated OCR models (glm-ocr) first, then other vision models.
  for (const providerId of orderedProviderIds) {
    const resolved = tryProvider(providerId, true)
    if (resolved) return resolved
  }
  for (const providerId of orderedProviderIds) {
    const resolved = tryProvider(providerId, false)
    if (resolved) return resolved
  }

  return null
}

export function normalizeOcrText(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:markdown|text)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
}

/**
 * Worker structured-clone turns Buffer into Uint8Array.
 * Uint8Array#toString('base64') ignores the encoding and returns "137,80,78,71,..."
 * which Ollama rejects as "illegal base64 data at input byte 3".
 */
