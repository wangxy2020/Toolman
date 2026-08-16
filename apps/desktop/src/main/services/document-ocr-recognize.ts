import { withTimeout } from '../utils/async-timeout'
import { isOcrVisionModelId } from '@toolman/shared'
import { getProviderConfig } from './provider.service'
import { logStructured } from './structured-log.service'
import {
  CHAT_OCR_PAGE_TIMEOUT_MS,
  OCR_PAGE_TIMEOUT_MS,
  OCR_SYSTEM_PROMPT,
  buildOcrUserPrompt,
  gateway,
  getCachedOcrVisionModel,
  normalizeOcrText,
  type ResolvedOcrVisionModel,
} from './document-ocr-model'

export function toOcrImageBase64(
  image: Buffer | Uint8Array | ArrayBuffer | { type?: string; data?: number[] },
): string {
  if (Buffer.isBuffer(image)) {
    return image.toString('base64')
  }
  if (image instanceof ArrayBuffer) {
    return Buffer.from(image).toString('base64')
  }
  if (ArrayBuffer.isView(image)) {
    return Buffer.from(image.buffer, image.byteOffset, image.byteLength).toString('base64')
  }
  if (image && typeof image === 'object' && Array.isArray(image.data)) {
    return Buffer.from(image.data).toString('base64')
  }
  throw new Error('Invalid image buffer for OCR')
}

/**
 * glm-ocr works best with Ollama `/api/generate` + `images: [rawBase64]`.
 * Never pass data-URLs or Uint8Array.toString() output.
 */
async function recognizeWithOllamaNative(
  config: NonNullable<ReturnType<typeof getProviderConfig>>,
  modelId: string,
  imageBuffer: Buffer | Uint8Array | ArrayBuffer,
  timeoutMs: number,
): Promise<string> {
  const baseUrl = (config.baseUrl ?? 'http://127.0.0.1:11434').replace(/\/$/, '').replace(/\/v1$/i, '')
  const imageBase64 = toOcrImageBase64(imageBuffer)

  // Prefer /api/generate for glm-ocr (official ollama_generate mode).
  const useGenerate = isOcrVisionModelId(modelId)
  const url = useGenerate ? `${baseUrl}/api/generate` : `${baseUrl}/api/chat`
  const body = useGenerate
    ? {
        model: modelId.trim(),
        prompt: 'Text Recognition:',
        images: [imageBase64],
        stream: false,
        options: {
          temperature: 0,
          num_ctx: 10240,
          num_predict: 8192,
        },
      }
    : {
        model: modelId.trim(),
        stream: false,
        messages: [
          {
            role: 'user',
            content: 'Text Recognition:',
            images: [imageBase64],
          },
        ],
        options: {
          temperature: 0,
          num_ctx: 10240,
          num_predict: 8192,
        },
      }

  const response = await withTimeout(
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    timeoutMs,
    'OCR 视觉模型响应超时，请检查 Ollama 是否可用',
  )

  if (!response.ok) {
    const detail = await response.text().catch(() => response.statusText)
    throw new Error(`Ollama 请求失败 (${response.status}): ${detail}`)
  }

  const payload = (await response.json()) as {
    response?: string
    message?: { content?: string; thinking?: string }
    error?: string
  }
  if (payload.error) {
    throw new Error(`Ollama 请求失败: ${payload.error}`)
  }

  const text = normalizeOcrText(
    payload.response || payload.message?.content || payload.message?.thinking || '',
  )
  if (!text) {
    throw new Error('视觉模型未返回可识别的文字内容')
  }
  return text
}

async function recognizeWithResolvedModel(
  resolved: ResolvedOcrVisionModel,
  buffer: Buffer | Uint8Array | ArrayBuffer,
  mimeType: string,
  options?: {
    pageNumber?: number
    totalPages?: number
    timeoutMs?: number
  },
): Promise<string> {
  const config = getProviderConfig(resolved.providerId)
  if (!config) {
    throw new Error('OCR Provider 不可用或已禁用')
  }

  const timeoutMs = options?.timeoutMs ?? OCR_PAGE_TIMEOUT_MS

  // Ollama OCR / VL models: native images[] API with raw base64.
  if (resolved.providerType === 'ollama') {
    return recognizeWithOllamaNative(config, resolved.modelId, buffer, timeoutMs)
  }

  const dataUrl = `data:${mimeType};base64,${toOcrImageBase64(buffer)}`
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
    timeoutMs,
    'OCR 视觉模型响应超时，请检查 Provider 是否可用',
  )

  const text = normalizeOcrText(result.content)
  if (!text) {
    throw new Error('视觉模型未返回可识别的文字内容')
  }
  return text
}

/**
 * Fallback order for page OCR after ODL/Hybrid:
 * 1) dedicated glm-ocr
 * 2) other vision / large multimodal models
 */
async function recognizeImageBuffer(
  buffer: Buffer | Uint8Array | ArrayBuffer,
  mimeType: string,
  workspaceId: string,
  kbId?: string,
  options?: {
    pageNumber?: number
    totalPages?: number
    timeoutMs?: number
  },
): Promise<string> {
  const glmOcr = getCachedOcrVisionModel(workspaceId, kbId, { ocrOnly: true })
  if (glmOcr) {
    try {
      return await recognizeWithResolvedModel(glmOcr, buffer, mimeType, options)
    } catch (error) {
      logStructured(
        'document-ocr',
        'warn',
        `glm-ocr failed (${glmOcr.modelId}); falling back to other vision models`,
        { error: error instanceof Error ? error.message : String(error) },
      )
    }
  }

  const fallback = getCachedOcrVisionModel(workspaceId, kbId, {
    ocrOnly: false,
    excludeModelIds: glmOcr ? [glmOcr.modelId] : [],
  })
  if (!fallback) {
    throw new Error(
      glmOcr
        ? `glm-ocr（${glmOcr.modelId}）识别失败，且未找到其他可用视觉模型。`
        : '未找到可用的 OCR / 视觉模型。请安装 glm-ocr:latest（ollama pull glm-ocr:latest），在知识库「文档处理」中选择 Ollama，并在设置中开启「文档 OCR 识别」。',
    )
  }

  return recognizeWithResolvedModel(fallback, buffer, mimeType, options)
}

export async function ocrImageBuffer(
  buffer: Buffer | Uint8Array | ArrayBuffer,
  mimeType: string,
  workspaceId: string,
  kbId?: string,
): Promise<string> {
  return recognizeImageBuffer(buffer, mimeType, workspaceId, kbId)
}

export async function ocrPdfPagePng(
  png: Buffer | Uint8Array | ArrayBuffer | { type?: string; data?: number[] },
  pageNumber: number,
  totalPages: number,
  workspaceId: string,
  kbId?: string,
  mimeType = 'image/png',
  options?: { chat?: boolean },
): Promise<string> {
  // Normalize worker-cloned buffers before any encoding.
  const bytes =
    Buffer.isBuffer(png) || png instanceof ArrayBuffer || ArrayBuffer.isView(png)
      ? png
      : Buffer.from((png as { data: number[] }).data ?? [])
  return recognizeImageBuffer(bytes, mimeType, workspaceId, kbId, {
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
    png: Buffer | Uint8Array | ArrayBuffer | { type?: string; data?: number[] }
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
