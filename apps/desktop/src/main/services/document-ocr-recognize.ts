import { withTimeout } from '../utils/async-timeout'
import { ocrPageLimiter } from './document-ocr-slot'
import { isOcrVisionModelId } from '@toolman/shared'
import { getProviderConfig } from './provider.service'
import { logStructured } from './structured-log.service'
import {
  assertIngestNotCancelled,
  getIngestOcrAbortSignal,
} from './knowledge-ingest-manager.service'
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
import {
  buildOllamaOcrGenerateOptions,
  consumeOllamaNdjsonLine,
  isOcrTokenRepeatMessage,
  salvageOllamaOcrAfterError,
} from './document-ocr-ollama-ndjson'

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

function mergeOcrAbortSignal(timeoutMs: number, extra?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs)
  if (!extra) return timeout
  if (typeof AbortSignal.any === 'function') return AbortSignal.any([timeout, extra])
  return extra.aborted ? extra : timeout
}

/**
 * glm-ocr works best with Ollama `/api/generate` + `images: [rawBase64]`.
 * Never pass data-URLs or Uint8Array.toString() output.
 */
async function readOllamaOcrNdjsonStream(
  response: Response,
  abortSignal?: AbortSignal,
): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('Ollama 响应无 body')
  }
  const decoder = new TextDecoder()
  const acc = { text: '' }
  let buffer = ''
  const onAbort = () => {
    void reader.cancel().catch(() => undefined)
  }
  abortSignal?.addEventListener('abort', onAbort, { once: true })

  try {
    while (true) {
      if (abortSignal?.aborted) {
        throw ocrAbortError(abortSignal)
      }
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const result = consumeOllamaNdjsonLine(line, acc)
        if (result.kind === 'error') {
          const salvaged = salvageOllamaOcrAfterError(result.message, acc.text)
          if (salvaged) return salvaged
          throw new Error(
            isOcrTokenRepeatMessage(result.message)
              ? `Ollama 请求失败 (500): {"error":"${result.message}"}`
              : `Ollama 请求失败: ${result.message}`,
          )
        }
      }
    }
    if (buffer.trim()) {
      const result = consumeOllamaNdjsonLine(buffer, acc)
      if (result.kind === 'error') {
        const salvaged = salvageOllamaOcrAfterError(result.message, acc.text)
        if (salvaged) return salvaged
        throw new Error(`Ollama 请求失败: ${result.message}`)
      }
    }
  } catch (error) {
    if (abortSignal?.aborted) throw ocrAbortError(abortSignal)
    throw error
  } finally {
    abortSignal?.removeEventListener('abort', onAbort)
    try {
      reader.releaseLock()
    } catch {
      // already cancelled/released
    }
  }

  return acc.text
}

function ocrAbortError(signal: AbortSignal): Error {
  const reason = signal.reason
  const name = reason instanceof Error ? reason.name : ''
  if (name === 'TimeoutError') {
    return new Error('OCR 视觉模型响应超时，请检查 Ollama 是否可用')
  }
  return new Error('索引任务已取消')
}

async function recognizeWithOllamaNative(
  config: NonNullable<ReturnType<typeof getProviderConfig>>,
  modelId: string,
  imageBuffer: Buffer | Uint8Array | ArrayBuffer,
  timeoutMs: number,
  abortSignal?: AbortSignal,
  retry = false,
): Promise<string> {
  const baseUrl = (config.baseUrl ?? 'http://127.0.0.1:11434').replace(/\/$/, '').replace(/\/v1$/i, '')
  const imageBase64 = toOcrImageBase64(imageBuffer)
  const generateOptions = buildOllamaOcrGenerateOptions(retry)
  const mergedSignal = mergeOcrAbortSignal(timeoutMs, abortSignal)

  // Prefer /api/generate for glm-ocr (official ollama_generate mode).
  // Stream so a token-repeat abort can still keep text already decoded.
  const useGenerate = isOcrVisionModelId(modelId)
  const url = useGenerate ? `${baseUrl}/api/generate` : `${baseUrl}/api/chat`
  const body = useGenerate
    ? {
        model: modelId.trim(),
        prompt: 'Text Recognition:',
        images: [imageBase64],
        stream: true,
        options: generateOptions,
      }
    : {
        model: modelId.trim(),
        stream: true,
        messages: [
          {
            role: 'user',
            content: 'Text Recognition:',
            images: [imageBase64],
          },
        ],
        options: generateOptions,
      }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: mergedSignal,
  }).catch((error: unknown) => {
    if (mergedSignal.aborted) throw ocrAbortError(mergedSignal)
    const name = error instanceof Error ? error.name : ''
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new Error('OCR 视觉模型响应超时，请检查 Ollama 是否可用')
    }
    throw error instanceof Error ? error : new Error(String(error))
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => response.statusText)
    const salvaged = salvageOllamaOcrAfterError(detail, '')
    if (salvaged) return salvaged
    throw new Error(`Ollama 请求失败 (${response.status}): ${detail}`)
  }

  const raw = await readOllamaOcrNdjsonStream(response, mergedSignal)
  const text = normalizeOcrText(raw)
  if (!text) {
    throw new Error('视觉模型未返回可识别的文字内容')
  }
  return text
}

async function recognizeWithOllamaNativeRetrying(
  config: NonNullable<ReturnType<typeof getProviderConfig>>,
  modelId: string,
  imageBuffer: Buffer | Uint8Array | ArrayBuffer,
  timeoutMs: number,
  abortSignal?: AbortSignal,
  decodeRetry = false,
): Promise<string> {
  if (decodeRetry) {
    return recognizeWithOllamaNative(config, modelId, imageBuffer, timeoutMs, abortSignal, true)
  }
  try {
    return await recognizeWithOllamaNative(config, modelId, imageBuffer, timeoutMs, abortSignal, false)
  } catch (error) {
    if (abortSignal?.aborted) {
      throw new Error('索引任务已取消')
    }
    if (!isOcrTokenRepeatMessage(error instanceof Error ? error.message : String(error))) {
      throw error instanceof Error ? error : new Error(String(error))
    }
    logStructured('document-ocr', 'warn', 'glm-ocr token-repeat; retrying page with tighter decode limits')
    return recognizeWithOllamaNative(config, modelId, imageBuffer, timeoutMs, abortSignal, true)
  }
}

async function recognizeWithResolvedModel(
  resolved: ResolvedOcrVisionModel,
  buffer: Buffer | Uint8Array | ArrayBuffer,
  mimeType: string,
  options?: {
    pageNumber?: number
    totalPages?: number
    timeoutMs?: number
    abortSignal?: AbortSignal
    retry?: boolean
  },
): Promise<string> {
  const config = getProviderConfig(resolved.providerId)
  if (!config) {
    throw new Error('OCR Provider 不可用或已禁用')
  }

  const timeoutMs = options?.timeoutMs ?? OCR_PAGE_TIMEOUT_MS

  // Ollama OCR / VL models: native images[] API with raw base64.
  if (resolved.providerType === 'ollama') {
    return withTimeout(
      recognizeWithOllamaNativeRetrying(
        config,
        resolved.modelId,
        buffer,
        timeoutMs,
        options?.abortSignal,
        options?.retry === true,
      ),
      timeoutMs,
      'OCR 视觉模型响应超时，请检查 Ollama 是否可用',
    )
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
 * 2) other vision / large multimodal models — chat preview only.
 * Knowledge ingest must not load a giant VL model after glm-ocr loops/fails;
 * that pins tens of GB RAM while page count barely moves.
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
    documentId?: string
    allowVisionFallback?: boolean
    retry?: boolean
  },
): Promise<string> {
  return ocrPageLimiter.run(() =>
    recognizeImageBufferUnlocked(buffer, mimeType, workspaceId, kbId, options),
  )
}

async function recognizeImageBufferUnlocked(
  buffer: Buffer | Uint8Array | ArrayBuffer,
  mimeType: string,
  workspaceId: string,
  kbId?: string,
  options?: {
    pageNumber?: number
    totalPages?: number
    timeoutMs?: number
    documentId?: string
    allowVisionFallback?: boolean
    retry?: boolean
  },
): Promise<string> {
  if (options?.documentId) {
    assertIngestNotCancelled(options.documentId)
  }
  const abortSignal = getIngestOcrAbortSignal(options?.documentId)
  const glmOcr = getCachedOcrVisionModel(workspaceId, kbId, { ocrOnly: true })
  if (glmOcr) {
    try {
      return await recognizeWithResolvedModel(glmOcr, buffer, mimeType, {
        ...options,
        abortSignal,
      })
    } catch (error) {
      if (options?.documentId) assertIngestNotCancelled(options.documentId)
      const message = error instanceof Error ? error.message : String(error)
      logStructured(
        'document-ocr',
        'warn',
        `glm-ocr failed (${glmOcr.modelId})${options?.allowVisionFallback ? '; falling back to other vision models' : ''}`,
        { error: message },
      )
      if (!options?.allowVisionFallback) {
        // Knowledge ingest: skip this page rather than aborting the rest of the book.
        if (isOcrTokenRepeatMessage(message) || /视觉模型未返回可识别/.test(message)) {
          logStructured(
            'document-ocr',
            'warn',
            `skipping OCR page ${options?.pageNumber ?? '?'} after glm-ocr token-repeat/empty result`,
          )
          return ''
        }
        throw error instanceof Error ? error : new Error(message)
      }
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

  return recognizeWithResolvedModel(fallback, buffer, mimeType, {
    ...options,
    abortSignal,
  })
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
  options?: { chat?: boolean; documentId?: string; retry?: boolean },
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
    documentId: options?.documentId,
    allowVisionFallback: Boolean(options?.chat),
    retry: options?.retry,
  })
}

export function createPdfOcrRecognizer(
  workspaceId: string,
  options?: { kbId?: string; chat?: boolean; documentId?: string },
) {
  return async ({
    png,
    pageNumber,
    totalPages,
    mimeType,
    retry,
  }: {
    png: Buffer | Uint8Array | ArrayBuffer | { type?: string; data?: number[] }
    pageNumber: number
    totalPages: number
    mimeType?: string
    retry?: boolean
  }) =>
    ocrPdfPagePng(
      png,
      pageNumber,
      totalPages,
      workspaceId,
      options?.kbId,
      mimeType,
      { chat: options?.chat, documentId: options?.documentId, retry },
    )
}
