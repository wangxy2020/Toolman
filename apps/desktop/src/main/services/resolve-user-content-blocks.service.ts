import { readFileSync, statSync } from 'node:fs'
import { basename } from 'node:path'
import {
  isImageFilePath,
  isSupportedKnowledgeFile,
  mimeTypeForKind,
  parseFile,
  resolveFileKind,
} from '@toolman/knowledge'
import type { ContentBlock } from '@toolman/shared'
import { buildChatParseOptions } from './chat-parse-options.service'
import { getBlobStoragePath, writeBlobFromPath } from './blob.service'
import { stageAttachmentPath } from './chat-attachment-stage.service'
import { tryGetIndexedPlainText } from './indexed-document-text.service'
import { isDocumentOcrEnabled } from './runtime-app-settings.service'
import { withTimeout } from '../utils/async-timeout'
import { throwIfAborted, withAbortSignal } from '../utils/abort-signal'

const DEFAULT_MAX_BYTES = 512 * 1024
/** 聊天附件解析总超时 */
const CHAT_PARSE_TIMEOUT_MS = 60 * 1000

const TEXT_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.markdown',
  '.json',
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.css',
  '.html',
  '.xml',
  '.yaml',
  '.yml',
  '.csv',
  '.log',
  '.sql',
  '.sh',
  '.py',
  '.go',
  '.rs',
  '.java',
  '.c',
  '.cpp',
  '.h',
  '.hpp',
  '.toml',
  '.ini',
  '.env',
])

function guessMimeType(name: string): string {
  const lower = name.toLowerCase()
  if (lower.endsWith('.json')) return 'application/json'
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'text/markdown'
  if (lower.endsWith('.html')) return 'text/html'
  if (lower.endsWith('.css')) return 'text/css'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.webp')) return 'image/webp'
  return 'text/plain'
}

function isLikelyTextFile(path: string): boolean {
  const lower = path.toLowerCase()
  const dot = lower.lastIndexOf('.')
  if (dot === -1) return true
  return TEXT_EXTENSIONS.has(lower.slice(dot))
}

function truncateText(content: string, maxBytes: number): { text: string; truncated: boolean } {
  const buffer = Buffer.from(content, 'utf8')
  if (buffer.length <= maxBytes) {
    return { text: content, truncated: false }
  }
  return {
    text: buffer.subarray(0, maxBytes).toString('utf8'),
    truncated: true,
  }
}

export function resolveAttachmentReadPath(block: { path: string; blobHash?: string }): string {
  if (block.blobHash?.trim()) {
    return getBlobStoragePath(block.blobHash)
  }
  return block.path
}

export interface ParseAttachmentOptions {
  workspaceId: string | null
  documentOcrEnabled?: boolean
  maxBytes?: number
  /** 原始路径，用于知识库索引与类型推断 */
  sourcePath?: string
  fileName?: string
  mimeType?: string
  onStatus?: (message: string) => void
}

export interface ParsedChatFile {
  name: string
  content: string
  mimeType: string
  truncated?: boolean
}

export interface ParsedChatImage {
  name: string
  blobHash: string
  mimeType: string
}

export async function parseChatFileAttachment(
  readPath: string,
  options: ParseAttachmentOptions,
): Promise<ParsedChatFile> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
  const documentOcrEnabled = options.documentOcrEnabled ?? isDocumentOcrEnabled()
  const workspaceId = options.workspaceId
  const sourcePath = options.sourcePath ?? readPath
  const fileName = options.fileName ?? basename(sourcePath)
  const parseOptions = workspaceId
    ? buildChatParseOptions(workspaceId, {
        documentOcrEnabled,
        onStatus: options.onStatus,
      })
    : undefined

  const stat = statSync(readPath)
  if (!stat.isFile()) {
    throw new Error('不是有效文件')
  }

  if (isImageFilePath(sourcePath) || isImageFilePath(fileName)) {
    throw new Error('请使用图片附件类型上传图片文件')
  }

  const kind = resolveFileKind({
    path: sourcePath,
    fileName,
    mimeType: options.mimeType,
  })

  if (kind && kind !== 'image') {
    if (workspaceId && !isSupportedKnowledgeFile(sourcePath, { ocrEnabled: documentOcrEnabled })) {
      throw new Error('暂不支持该文件类型')
    }

    const indexedText =
      workspaceId && kind === 'pdf' ? tryGetIndexedPlainText(workspaceId, sourcePath) : null
    if (indexedText) {
      const { text, truncated } = truncateText(indexedText, maxBytes)
      if (!text) throw new Error('未能从文件中提取到文本内容')
      return {
        name: fileName,
        content: text,
        mimeType: mimeTypeForKind(kind, sourcePath),
        ...(truncated ? { truncated: true } : {}),
      }
    }

    const parsed = await withTimeout(
      parseFile(readPath, { ...parseOptions, kind }),
      CHAT_PARSE_TIMEOUT_MS,
      '文件解析超时，扫描件 PDF 可能需要较长时间，请稍后重试',
    )
    const { text, truncated } = truncateText(parsed.plainText.trim(), maxBytes)
    if (!text) {
      throw new Error('未能从文件中提取到文本内容')
    }
    return {
      name: fileName,
      content: text,
      mimeType: parsed.mimeType,
      ...(truncated ? { truncated: true } : {}),
    }
  }

  if (!isLikelyTextFile(sourcePath) && !isLikelyTextFile(fileName)) {
    throw new Error('暂不支持该文件类型')
  }

  const buffer = readFileSync(readPath)
  const truncated = buffer.length > maxBytes
  const slice = truncated ? buffer.subarray(0, maxBytes) : buffer
  const content = slice.toString('utf-8').trim()
  if (!content) {
    throw new Error('文件内容为空')
  }

  return {
    name: fileName,
    content,
    mimeType: guessMimeType(fileName),
    ...(truncated ? { truncated: true } : {}),
  }
}

export function parseChatImageAttachment(path: string): ParsedChatImage {
  const staged = stageAttachmentPath(path)
  if (staged.kind !== 'image') {
    throw new Error('不支持的图片格式')
  }

  return {
    name: staged.name,
    blobHash: staged.blobHash,
    mimeType: staged.mimeType,
  }
}

export function contentBlocksNeedStaging(blocks: ContentBlock[]): boolean {
  return blocks.some(
    (block) =>
      (block.type === 'file' && !block.blobHash?.trim()) ||
      (block.type === 'image' && !block.blobHash?.trim()),
  )
}

export function contentBlocksNeedResolution(blocks: ContentBlock[]): boolean {
  return blocks.some(
    (block) =>
      (block.type === 'file' && !block.content?.trim()) ||
      (block.type === 'image' && !block.blobHash?.trim()),
  )
}

/** 将附件复制到应用本地存储（快速），避免依赖工作区外原始路径 */
export async function stageUserContentBlocks(blocks: ContentBlock[]): Promise<ContentBlock[]> {
  const staged: ContentBlock[] = []

  for (const block of blocks) {
    if (block.type === 'file') {
      if (block.blobHash?.trim()) {
        staged.push(block)
        continue
      }

      if (!block.path) {
        throw new Error(`附件「${block.name}」缺少文件路径`)
      }

      const record = writeBlobFromPath(block.path)
      staged.push({
        ...block,
        blobHash: record.hash,
        mimeType: block.mimeType ?? record.mimeType,
      })
      continue
    }

    if (block.type === 'image') {
      if (block.blobHash?.trim()) {
        staged.push(block)
        continue
      }

      if (!block.path) {
        throw new Error('图片附件缺少文件路径')
      }

      const parsed = parseChatImageAttachment(block.path)
      staged.push({
        ...block,
        blobHash: parsed.blobHash,
        mimeType: parsed.mimeType,
        alt: block.alt ?? parsed.name,
      })
      continue
    }

    staged.push(block)
  }

  return staged
}

export async function ensureResolvedUserContentBlocks(
  blocks: ContentBlock[],
  workspaceId: string,
  options?: { documentOcrEnabled?: boolean },
): Promise<ContentBlock[]> {
  const staged = await stageUserContentBlocks(blocks)
  if (!contentBlocksNeedResolution(staged)) return staged
  return resolveUserContentBlocks(staged, workspaceId, options)
}

export async function resolveUserContentBlocks(
  blocks: ContentBlock[],
  workspaceId: string,
  options?: {
    documentOcrEnabled?: boolean
    onStatus?: (message: string) => void
    signal?: AbortSignal
  },
): Promise<ContentBlock[]> {
  const resolved: ContentBlock[] = []

  for (const block of blocks) {
    throwIfAborted(options?.signal)

    if (block.type === 'file') {
      if (block.content?.trim()) {
        resolved.push(block)
        continue
      }

      const readPath = resolveAttachmentReadPath(block)
      options?.onStatus?.(`正在解析「${block.name || basename(block.path)}」…`)
      let parsed: ParsedChatFile
      try {
        parsed = await withAbortSignal(
          parseChatFileAttachment(readPath, {
            workspaceId,
            documentOcrEnabled: options?.documentOcrEnabled,
            sourcePath: block.path,
            fileName: block.name,
            mimeType: block.mimeType,
            onStatus: options?.onStatus,
          }),
          options?.signal,
        )
      } catch (error) {
        const label = block.name || basename(block.path)
        const detail = error instanceof Error ? error.message.trim() : ''
        const message = detail || '读取或解析文件失败'
        throw new Error(`「${label}」${message}`)
      }
      resolved.push({
        ...block,
        name: block.name || parsed.name,
        content: parsed.content,
        mimeType: parsed.mimeType,
        truncated: parsed.truncated,
      })
      continue
    }

    if (block.type === 'image') {
      if (block.blobHash?.trim()) {
        resolved.push(block)
        continue
      }

      if (!block.path) {
        throw new Error('图片附件缺少文件路径')
      }

      const parsed = parseChatImageAttachment(block.path)
      resolved.push({
        ...block,
        blobHash: parsed.blobHash,
        mimeType: parsed.mimeType,
        alt: block.alt ?? parsed.name,
      })
      continue
    }

    resolved.push(block)
  }

  return resolved
}
