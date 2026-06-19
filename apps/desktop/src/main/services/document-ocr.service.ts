import { createModelGateway } from '@toolman/model-gateway'
import {
  KnowledgeEmbedConfigSchema,
  DEFAULT_KNOWLEDGE_EMBED_CONFIG,
  enrichProviderModel,
  getModelTypeSupport,
  type ProviderModel,
} from '@toolman/shared'
import { getKnowledgeBaseRepository } from '../db/repos'
import { withTimeout } from '../utils/async-timeout'
import {
  getProviderConfig,
  getProviderRow,
  isChatModelId,
  listProviders,
} from './provider.service'
import { resolveWorkspaceDocProcessorContext } from './workspace-doc-processor.service'

const gateway = createModelGateway()

const OCR_SYSTEM_PROMPT = `You are a high-accuracy OCR engine for document page images.
Extract ALL visible text exactly as printed, including Chinese, English, numbers, punctuation, and symbols.
Preserve paragraph breaks, line breaks, table rows, headers, footers, stamps, and list structure.
For tables, keep rows on separate lines and separate columns with tabs when possible.
Do not summarize, translate, explain, or wrap the output in markdown.
If a small region is completely unreadable, write [无法识别] for that region only.`

function buildOcrUserPrompt(pageNumber: number, totalPages: number): string {
  return `请逐字提取第 ${pageNumber}/${totalPages} 页图片中的全部可见文字，只输出识别结果，不要添加任何说明。`
}

export const MAX_OCR_PAGES = 40
export const CHAT_OCR_MAX_PAGES = 10
const OCR_PAGE_TIMEOUT_MS = 5 * 60 * 1000
const CHAT_OCR_PAGE_TIMEOUT_MS = 2 * 60 * 1000

interface ResolvedOcrVisionModel {
  providerId: string
  providerType: NonNullable<ReturnType<typeof getProviderConfig>>['type']
  modelId: string
}

function parseEmbedConfig(embedConfigJson: string) {
  try {
    return KnowledgeEmbedConfigSchema.parse(JSON.parse(embedConfigJson))
  } catch {
    return DEFAULT_KNOWLEDGE_EMBED_CONFIG
  }
}

function isVisionModel(model: ProviderModel): boolean {
  if (!isChatModelId(model.id)) return false
  const enriched = enrichProviderModel(model)
  const support = getModelTypeSupport(model.id)
  return Boolean(enriched.types?.vision ?? support.vision)
}

function pickVisionModel(models: ProviderModel[]): string | null {
  for (const model of models) {
    if (isVisionModel(model)) return model.id
  }
  return null
}

function resolveOcrVisionModel(
  workspaceId: string,
  kbId?: string,
): ResolvedOcrVisionModel | null {
  let preferredProviderId: string | null = null

  if (kbId) {
    const kb = getKnowledgeBaseRepository().findRowById(kbId, workspaceId)
    const embedConfig = kb ? parseEmbedConfig(kb.embedConfigJson) : DEFAULT_KNOWLEDGE_EMBED_CONFIG
    preferredProviderId = embedConfig.docProcessorProviderId ?? null
  } else {
    preferredProviderId = resolveWorkspaceDocProcessorContext(workspaceId).providerId
  }

  const tryProvider = (providerId: string): ResolvedOcrVisionModel | null => {
    const row = getProviderRow(providerId)
    if (!row || !row.isEnabled || row.workspaceId !== workspaceId) return null
    const config = getProviderConfig(providerId)
    if (!config) return null
    const models = (JSON.parse(row.modelsJson) as ProviderModel[]).map((model) =>
      enrichProviderModel(model),
    )
    const modelId = pickVisionModel(models)
    if (!modelId) return null
    return { providerId, providerType: config.type, modelId }
  }

  if (preferredProviderId) {
    const resolved = tryProvider(preferredProviderId)
    if (resolved) return resolved
  }

  const providerList = listProviders({ workspaceId, enabledOnly: true })
  for (const provider of providerList) {
    const resolved = tryProvider(provider.id)
    if (resolved) return resolved
  }

  return null
}

async function recognizeImageBuffer(
  buffer: Buffer,
  mimeType: string,
  workspaceId: string,
  kbId?: string,
  options?: {
    pageNumber?: number
    totalPages?: number
    timeoutMs?: number
  },
): Promise<string> {
  const resolved = resolveOcrVisionModel(workspaceId, kbId)
  if (!resolved) {
    throw new Error(
      '未找到可用的视觉模型。请在知识库设置中选择文档处理 Provider，并确保该 Provider 已配置支持视觉的模型。',
    )
  }

  const config = getProviderConfig(resolved.providerId)
  if (!config) {
    throw new Error('OCR Provider 不可用或已禁用')
  }

  const dataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`
  const userPrompt =
    options?.pageNumber && options?.totalPages
      ? buildOcrUserPrompt(options.pageNumber, options.totalPages)
      : '请逐字提取图片中的全部可见文字，只输出识别结果，不要添加任何说明。'
  const result = await withTimeout(
    gateway.chatComplete(
      { type: resolved.providerType, baseUrl: config.baseUrl, apiKey: config.apiKey },
      {
        model: resolved.modelId,
        messages: [
          { role: 'system', content: OCR_SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: userPrompt },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
        temperature: 0,
        maxTokens: 8192,
      },
    ),
    options?.timeoutMs ?? OCR_PAGE_TIMEOUT_MS,
    'OCR 视觉模型响应超时，请检查 Provider 是否可用',
  )

  const text = result.content.trim()
  if (!text) {
    throw new Error('视觉模型未返回可识别的文字内容')
  }
  return text
}

export async function ocrImageBuffer(
  buffer: Buffer,
  mimeType: string,
  workspaceId: string,
  kbId?: string,
): Promise<string> {
  return recognizeImageBuffer(buffer, mimeType, workspaceId, kbId)
}

export async function ocrImageFile(
  filePath: string,
  mimeType: string,
  workspaceId: string,
  kbId?: string,
): Promise<string> {
  const { readFileSync } = await import('node:fs')
  return recognizeImageBuffer(readFileSync(filePath), mimeType, workspaceId, kbId)
}

export async function ocrPdfPagePng(
  png: Buffer,
  pageNumber: number,
  totalPages: number,
  workspaceId: string,
  kbId?: string,
  mimeType = 'image/png',
  options?: { chat?: boolean },
): Promise<string> {
  return recognizeImageBuffer(png, mimeType, workspaceId, kbId, {
    pageNumber,
    totalPages,
    timeoutMs: options?.chat ? CHAT_OCR_PAGE_TIMEOUT_MS : OCR_PAGE_TIMEOUT_MS,
  })
}

export function createPdfOcrRecognizer(
  workspaceId: string,
  options?: { kbId?: string; chat?: boolean },
) {
  return async ({
    png,
    pageNumber,
    totalPages,
    mimeType,
  }: {
    png: Buffer
    pageNumber: number
    totalPages: number
    mimeType?: string
  }) =>
    ocrPdfPagePng(
      png,
      pageNumber,
      totalPages,
      workspaceId,
      options?.kbId,
      mimeType,
      { chat: options?.chat },
    )
}
