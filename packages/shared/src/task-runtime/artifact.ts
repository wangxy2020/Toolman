import { z } from 'zod'

function basenamePath(name: string): string {
  const normalized = name.replace(/\\/g, '/')
  const last = normalized.split('/').pop()
  return last ?? name
}

export const TaskArtifactKindSchema = z.enum([
  'file',
  'report',
  'export',
  'image',
  'data',
  'other',
])
export type TaskArtifactKind = z.infer<typeof TaskArtifactKindSchema>

export const TaskArtifactSourceSchema = z.object({
  stepId: z.string().uuid().optional(),
  toolName: z.string().min(1).optional(),
  messageId: z.string().uuid().optional(),
})
export type TaskArtifactSource = z.infer<typeof TaskArtifactSourceSchema>

export const TaskArtifactSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
  name: z.string().min(1),
  kind: TaskArtifactKindSchema,
  relativePath: z.string().min(1),
  absolutePath: z.string().min(1),
  mimeType: z.string().optional(),
  sizeBytes: z.number().int().nonnegative(),
  source: TaskArtifactSourceSchema.optional(),
  metadata: z.record(z.unknown()).default({}),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
})
export type TaskArtifact = z.infer<typeof TaskArtifactSchema>

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'])
const DATA_EXTENSIONS = new Set(['json', 'csv', 'tsv', 'xml', 'yaml', 'yml'])
const REPORT_EXTENSIONS = new Set(['md', 'txt', 'pdf', 'html', 'docx'])
const EXPORT_EXTENSIONS = new Set(['xlsx', 'xls', 'zip', 'tar', 'gz'])

export function sanitizeArtifactFileName(name: string): string {
  const base = basenamePath(name).trim()
  const sanitized = base.replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, ' ').trim()
  return sanitized || 'artifact'
}

export function inferTaskArtifactKind(fileName: string, mimeType?: string): TaskArtifactKind {
  const mime = mimeType?.toLowerCase() ?? ''
  if (mime.startsWith('image/')) return 'image'
  if (mime.includes('json') || mime.includes('csv')) return 'data'
  if (mime.includes('pdf') || mime.includes('markdown') || mime.includes('text/plain')) {
    return 'report'
  }

  const ext = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() ?? '' : ''
  if (IMAGE_EXTENSIONS.has(ext)) return 'image'
  if (DATA_EXTENSIONS.has(ext)) return 'data'
  if (REPORT_EXTENSIONS.has(ext)) return 'report'
  if (EXPORT_EXTENSIONS.has(ext)) return 'export'
  return 'file'
}

export function guessMimeTypeFromFileName(fileName: string): string | undefined {
  const ext = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() ?? '' : ''
  switch (ext) {
    case 'png':
      return 'image/png'
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'gif':
      return 'image/gif'
    case 'webp':
      return 'image/webp'
    case 'svg':
      return 'image/svg+xml'
    case 'pdf':
      return 'application/pdf'
    case 'json':
      return 'application/json'
    case 'csv':
      return 'text/csv'
    case 'md':
      return 'text/markdown'
    case 'txt':
      return 'text/plain'
    case 'html':
      return 'text/html'
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    case 'zip':
      return 'application/zip'
    default:
      return undefined
  }
}
