import { getBlobStoragePath } from '../blob.service'

const DEFAULT_MAX_BYTES = 512 * 1024
/** 聊天附件解析总超时 */
export const CHAT_PARSE_TIMEOUT_MS = 60 * 1000

export const TEXT_EXTENSIONS = new Set([
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

export function guessMimeType(name: string): string {
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

export function isLikelyTextFile(path: string): boolean {
  const lower = path.toLowerCase()
  const dot = lower.lastIndexOf('.')
  if (dot === -1) return true
  return TEXT_EXTENSIONS.has(lower.slice(dot))
}

export function truncateText(content: string, maxBytes: number): { text: string; truncated: boolean } {
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

export { DEFAULT_MAX_BYTES }
