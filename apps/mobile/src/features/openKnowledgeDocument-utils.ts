/**
 * Toolman — Copyright (C) 2024–2026 Toolman Contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Source: https://github.com/wangxy2020/Toolman
 */
import { type KnowledgeSnapshotFile } from '@toolman/shared'
import { fileExtension, type KnowledgeFileItem } from './knowledgeSidebar'

const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  txt: 'text/plain;charset=utf-8',
  md: 'text/markdown;charset=utf-8',
  markdown: 'text/markdown;charset=utf-8',
  html: 'text/html;charset=utf-8',
  htm: 'text/html;charset=utf-8',
  csv: 'text/csv;charset=utf-8',
  json: 'application/json',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  epub: 'application/epub+zip',
}

export function knowledgeFileMime(fileName: string, mimeType?: string | null): string {
  const provided = mimeType?.trim()
  if (provided && provided !== 'application/octet-stream') return provided
  return MIME_BY_EXT[fileExtension(fileName)] ?? 'application/octet-stream'
}

export function knowledgeOpenUrl(doc: KnowledgeFileItem): string | null {
  const candidates = [doc.absolutePath, doc.sourceKind === 'url' ? doc.title : '']
  for (const value of candidates) {
    const href = value?.trim() ?? ''
    if (/^https?:\/\//i.test(href)) return href
  }
  return null
}

export function knowledgeFileUnavailableMessage(
  file: KnowledgeSnapshotFile | undefined,
): string | null {
  if (!file) return null
  if (file.contentB64) return null
  if (file.omitReason === 'missing') return '桌面端没有这份文件'
  return null
}
