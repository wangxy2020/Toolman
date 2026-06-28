import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import {
  extractPdfPlainText,
  isPdfExtractedTextInsufficient,
  mimeTypeForKind,
  parseFile,
  renderPdfPagesToPng,
  resolveFileKind,
  type SupportedFileKind,
} from '@toolman/knowledge'
import type { ContentBlock } from '@toolman/shared'
import { getModelTypeSupport, isOcrVisionModelId, DOCX_MCP_SERVER_ID, EXCEL_MCP_SERVER_ID } from '@toolman/shared'
import { providerSupportsOpenAiVision } from '@toolman/model-gateway'
import { getProviderConfig, parseModelId } from './provider.service'
import { writeBlobFromBuffer } from './blob.service'
import {
  resolveAttachmentReadPath,
  stageUserContentBlocks,
} from './resolve-user-content-blocks.service'
import { CHAT_OCR_MAX_PAGES } from './document-ocr.service'
import { buildChatPdfOcrOptions } from './knowledge-parse-options.service'
import { isDocumentOcrEnabled } from './runtime-app-settings.service'
import { throwIfAborted, withAbortSignal } from '../utils/abort-signal'
import { withTimeout } from '../utils/async-timeout'

const CHAT_MAX_PDF_VISION_PAGES = 5
const CHAT_TEXT_MAX_BYTES = 512 * 1024
const QUICK_PDF_TIMEOUT_MS = 15 * 1000
const CHAT_PARSE_TIMEOUT_MS = 30 * 1000
const CHAT_OCR_TIMEOUT_MS = 3 * 60 * 1000

const TEXT_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.markdown',
  '.json',
  '.csv',
  '.log',
  '.yaml',
  '.yml',
  '.html',
  '.htm',
])

/** 通过 parseFile 提取正文的类型（与知识库解析器共用；doc/wps 在 DOCX MCP 路径下不经过此处） */
const PARSE_TEXT_KINDS = new Set<SupportedFileKind>([
  'doc',
  'docx',
  'xls',
  'xlsx',
  'pptx',
  'html',
  'epub',
  'markdown',
  'text',
  'csv',
])

const DOCX_MCP_SOURCE_KINDS = new Set<SupportedFileKind>(['docx', 'doc', 'wps'])
const EXCEL_MCP_SOURCE_KINDS = new Set<SupportedFileKind>(['xlsx', 'xls'])

/** Align with providerSupportsOpenAiVision (e.g. deepseek-v4-pro) and heuristics (gemma/qwen). */
export function resolveModelSupportsVision(modelId: string): boolean {
  const { providerId, model } = parseModelId(modelId)
  const providerConfig = getProviderConfig(providerId)
  if (providerConfig && providerSupportsOpenAiVision(providerConfig, model)) {
    return true
  }
  return getModelTypeSupport(model).vision
}

function isLikelyTextFile(name: string): boolean {
  const lower = name.toLowerCase()
  const dot = lower.lastIndexOf('.')
  if (dot === -1) return true
  return TEXT_EXTENSIONS.has(lower.slice(dot))
}

function truncateForChat(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) {
    throw new Error('文件内容为空')
  }
  const bytes = Buffer.byteLength(trimmed, 'utf-8')
  if (bytes <= CHAT_TEXT_MAX_BYTES) return trimmed
  const slice = Buffer.from(trimmed, 'utf-8').subarray(0, CHAT_TEXT_MAX_BYTES).toString('utf-8')
  return `${slice.trim()}\n\n（文件内容过长，已截断）`
}

function readTextFileSnippet(readPath: string): string {
  const buffer = readFileSync(readPath)
  const truncated = buffer.length > CHAT_TEXT_MAX_BYTES
  const slice = truncated ? buffer.subarray(0, CHAT_TEXT_MAX_BYTES) : buffer
  const content = slice.toString('utf-8').trim()
  if (!content) {
    throw new Error('文件内容为空')
  }
  return truncated ? `${content}\n\n（文件内容过长，已截断）` : content
}

async function renderPdfVisionPages(
  readPath: string,
  options: { signal?: AbortSignal },
): Promise<Array<{ blobHash: string; mimeType: string; pageNumber: number }>> {
  const { pages } = await renderPdfPagesToPng(
    readPath,
    CHAT_MAX_PDF_VISION_PAGES,
    undefined,
    'vision',
  )

  const visionPages: Array<{ blobHash: string; mimeType: string; pageNumber: number }> = []

  for (const page of pages) {
    throwIfAborted(options.signal)
    const record = writeBlobFromBuffer(page.png, page.mimeType)
    visionPages.push({
      blobHash: record.hash,
      mimeType: record.mimeType,
      pageNumber: page.pageNumber,
    })
  }

  return visionPages
}

async function tryQuickPdfText(readPath: string): Promise<string> {
  return withTimeout(
    extractPdfPlainText(readPath, { preferPdfJs: true }),
    QUICK_PDF_TIMEOUT_MS,
    'PDF 文本提取超时',
  )
}

async function parseDocumentText(
  readPath: string,
  kind: SupportedFileKind,
  signal?: AbortSignal,
): Promise<string> {
  return withAbortSignal(
    withTimeout(
      (async () => {
        const parsed = await parseFile(readPath, { kind })
        return parsed.plainText.trim()
      })(),
      CHAT_PARSE_TIMEOUT_MS,
      '文件解析超时',
    ),
    signal,
  )
}

async function tryOcrPdfText(
  readPath: string,
  workspaceId: string,
  options: { signal?: AbortSignal },
): Promise<string> {
  const ocr = buildChatPdfOcrOptions(workspaceId)
  if (!ocr?.recognizePage) return ''

  return withAbortSignal(
    withTimeout(
      extractPdfPlainText(readPath, {
        preferPdfJs: true,
        textQuality: 'strict',
        ocr: {
          recognizePage: ocr.recognizePage,
          maxPages: CHAT_OCR_MAX_PAGES,
        },
      }),
      CHAT_OCR_TIMEOUT_MS,
      'PDF OCR 识别超时',
    ),
    options.signal,
  )
}

async function preparePdfBlock(
  block: Extract<ContentBlock, { type: 'file' }>,
  readPath: string,
  fileName: string,
  supportsVision: boolean,
  options: {
    workspaceId?: string
    documentOcrEnabled?: boolean
    ocrChatModel?: boolean
    signal?: AbortSignal
    onStatus?: (message: string) => void
  },
): Promise<ContentBlock> {
  if (options.ocrChatModel && supportsVision) {
    options.onStatus?.(`正在将「${fileName}」转为页面图片并发送给 OCR 模型…`)
    const visionPages = await withAbortSignal(
      renderPdfVisionPages(readPath, { signal: options.signal }),
      options.signal,
    )
    return { ...block, delivery: 'vision', visionPages }
  }

  options.onStatus?.(`正在提取「${fileName}」文本…`)
  let extractedText = ''
  try {
    extractedText = await withAbortSignal(tryQuickPdfText(readPath), options.signal)
  } catch {
    // 文本不足或超时，尝试 OCR / 视觉路径
  }

  const normalizedText = extractedText.trim()
  if (normalizedText && !isPdfExtractedTextInsufficient(normalizedText, 1)) {
    return { ...block, content: truncateForChat(normalizedText), delivery: 'text' }
  }

  const ocrEnabled = (options.documentOcrEnabled ?? isDocumentOcrEnabled()) && options.workspaceId
  if (ocrEnabled && options.workspaceId) {
    options.onStatus?.(`正在 OCR 识别「${fileName}」（前 ${CHAT_OCR_MAX_PAGES} 页）…`)
    try {
      const ocrText = (await tryOcrPdfText(readPath, options.workspaceId, options)).trim()
      if (ocrText && !isPdfExtractedTextInsufficient(ocrText, 1)) {
        return { ...block, content: truncateForChat(ocrText), delivery: 'text' }
      }
    } catch {
      // OCR 失败时回退到视觉路径
    }
  }

  if (supportsVision) {
    options.onStatus?.(`正在将「${fileName}」转为高清页面图片并发送给模型…`)
    const visionPages = await withAbortSignal(
      renderPdfVisionPages(readPath, { signal: options.signal }),
      options.signal,
    )
    return { ...block, delivery: 'vision', visionPages }
  }

  throw new Error(
    `「${fileName}」未能提取到可用文本。请改用支持视觉的模型（如 gemma4:26b），或将扫描件先导入知识库。`,
  )
}

async function prepareFileBlock(
  block: Extract<ContentBlock, { type: 'file' }>,
  supportsVision: boolean,
  options: {
    workspaceId?: string
    documentOcrEnabled?: boolean
    ocrChatModel?: boolean
    docxMcpEnabled?: boolean
    excelMcpEnabled?: boolean
    signal?: AbortSignal
    onStatus?: (message: string) => void
  },
): Promise<ContentBlock> {
  const readPath = resolveAttachmentReadPath(block)
  const fileName = block.name || basename(block.path)
  const kind = resolveFileKind({
    path: block.path,
    fileName,
    mimeType: block.mimeType,
  })

  if (!kind) {
    throw new Error(`「${fileName}」暂不支持在聊天中直接处理该文件类型`)
  }

  if (DOCX_MCP_SOURCE_KINDS.has(kind) && options.docxMcpEnabled) {
    options.onStatus?.(`「${fileName}」将通过 DOCX MCP 工具处理…`)
    return { ...block, content: '', delivery: 'docx_tool' }
  }

  if (EXCEL_MCP_SOURCE_KINDS.has(kind) && options.excelMcpEnabled) {
    options.onStatus?.(`「${fileName}」将通过 Excel MCP 工具处理…`)
    return { ...block, content: '', delivery: 'excel_tool' }
  }

  if (kind === 'image') {
    if (!supportsVision) {
      throw new Error(`「${fileName}」是图片，请切换到支持视觉的模型（如 gemma4:26b、deepseek-v4-pro）后重试。`)
    }
    if (!block.blobHash?.trim()) {
      throw new Error(`图片「${fileName}」尚未就绪，请重新发送。`)
    }
    return {
      type: 'image',
      blobHash: block.blobHash,
      mimeType: block.mimeType ?? mimeTypeForKind('image', fileName),
      path: block.path,
      alt: fileName,
    }
  }

  if (isLikelyTextFile(fileName) && kind !== 'pdf') {
    options.onStatus?.(`正在读取「${fileName}」…`)
    const content = readTextFileSnippet(readPath)
    return { ...block, content, delivery: 'text' }
  }

  if (PARSE_TEXT_KINDS.has(kind)) {
    options.onStatus?.(`正在解析「${fileName}」…`)
    const content = truncateForChat(
      await parseDocumentText(readPath, kind, options.signal),
    )
    return { ...block, content, delivery: 'text' }
  }

  if (kind === 'pdf') {
    return preparePdfBlock(block, readPath, fileName, supportsVision, options)
  }

  throw new Error(`「${fileName}」暂不支持在聊天中直接处理该文件类型`)
}

export function contentBlocksNeedModelPrepare(blocks: ContentBlock[]): boolean {
  return blocks.some((block) => {
    if (block.type === 'image') return !block.blobHash?.trim()
    if (block.type !== 'file') return false
    if (block.content?.trim()) return false
    if (block.visionPages && block.visionPages.length > 0) return false
    return true
  })
}

export async function prepareChatAttachmentsForModel(options: {
  blocks: ContentBlock[]
  modelId: string
  workspaceId?: string
  mcpServerIds?: string[]
  documentOcrEnabled?: boolean
  signal?: AbortSignal
  onStatus?: (message: string) => void
}): Promise<ContentBlock[]> {
  const staged = await stageUserContentBlocks(options.blocks)
  const { model } = parseModelId(options.modelId)
  const supportsVision = resolveModelSupportsVision(options.modelId)
  const ocrChatModel = isOcrVisionModelId(model)
  const docxMcpEnabled = options.mcpServerIds?.includes(DOCX_MCP_SERVER_ID) ?? false
  const excelMcpEnabled = options.mcpServerIds?.includes(EXCEL_MCP_SERVER_ID) ?? false
  const prepared: ContentBlock[] = []

  for (const block of staged) {
    throwIfAborted(options.signal)

    if (block.type === 'image') {
      if (!block.blobHash?.trim()) {
        throw new Error('图片附件尚未就绪，请重新选择后发送')
      }
      prepared.push(block)
      continue
    }

    if (block.type !== 'file') {
      prepared.push(block)
      continue
    }

    if (block.content?.trim() || (block.visionPages && block.visionPages.length > 0)) {
      prepared.push(block)
      continue
    }

    prepared.push(
      await prepareFileBlock(block, supportsVision, {
        workspaceId: options.workspaceId,
        documentOcrEnabled: options.documentOcrEnabled,
        ocrChatModel,
        docxMcpEnabled,
        excelMcpEnabled,
        signal: options.signal,
        onStatus: options.onStatus,
      }),
    )
  }

  return prepared
}
