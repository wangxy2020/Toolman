import { existsSync } from 'node:fs'
import { scanDirectory } from '@toolman/knowledge'
import {
  DEFAULT_KNOWLEDGE_WATCH_CONFIG,
  KnowledgeFolderScanPreviewInputSchema,
  KnowledgeFolderScanPreviewOutputSchema,
} from '@toolman/shared'
import { resolveKnowledgeWatchConfig } from './knowledge-watch-config.service'

const EXTENSION_LABELS: Record<string, string> = {
  md: 'Markdown',
  markdown: 'Markdown',
  txt: 'TXT',
  pdf: 'PDF',
  doc: 'DOC',
  docx: 'DOCX',
  xls: 'XLS',
  xlsx: 'XLSX',
  csv: 'CSV',
  pptx: 'PPTX',
  html: 'HTML',
  htm: 'HTML',
  epub: 'EPUB',
  png: 'PNG',
  jpg: 'JPG',
  jpeg: 'JPEG',
  webp: 'WEBP',
  gif: 'GIF',
  bmp: 'BMP',
}

function countFilesByType(paths: string[]) {
  const counts = new Map<string, number>()

  for (const path of paths) {
    const name = path.split(/[/\\]/).pop() ?? ''
    const dot = name.lastIndexOf('.')
    if (dot < 0) continue
    const ext = name.slice(dot + 1).toLowerCase()
    counts.set(ext, (counts.get(ext) ?? 0) + 1)
  }

  return Array.from(counts.entries())
    .map(([type, count]) => ({
      type,
      label: EXTENSION_LABELS[type] ?? type.toUpperCase(),
      count,
    }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, 'zh-CN'))
}

export function scanKnowledgeFolderPreview(input: unknown) {
  const data = KnowledgeFolderScanPreviewInputSchema.parse(input)
  const folderPath = data.folderPath.trim()

  if (!existsSync(folderPath)) {
    return KnowledgeFolderScanPreviewOutputSchema.parse({
      total: 0,
      counts: [],
    })
  }

  const watchConfig = resolveKnowledgeWatchConfig(
    JSON.stringify(DEFAULT_KNOWLEDGE_WATCH_CONFIG),
  )

  const files = scanDirectory({
    rootPath: folderPath,
    include: watchConfig.include,
    exclude: watchConfig.exclude,
  })

  return KnowledgeFolderScanPreviewOutputSchema.parse({
    total: files.length,
    counts: countFilesByType(files),
  })
}
