import type { TranslationContrastItem, TranslationDocumentItem } from './translation-storage'

export function buildContrastExportContent(item: TranslationContrastItem): string {
  const parts: string[] = []
  if (item.sourceText.trim()) {
    parts.push(`## 原文\n\n${item.sourceText.trim()}`)
  }
  if (item.targetText.trim()) {
    parts.push(`## 译文\n\n${item.targetText.trim()}`)
  }
  return parts.join('\n\n')
}

export function buildDocumentExportContent(item: TranslationDocumentItem): string {
  const parts: string[] = [`文件：\`${item.filePath}\``]
  if (item.sourceText.trim()) {
    parts.push(`## 解析\n\n${item.sourceText.trim()}`)
  }
  if (item.targetText.trim()) {
    parts.push(`## 译文\n\n${item.targetText.trim()}`)
  }
  return parts.join('\n\n')
}

export function hasContrastExportContent(item: TranslationContrastItem): boolean {
  return Boolean(item.sourceText.trim() || item.targetText.trim())
}

export function hasDocumentExportContent(item: TranslationDocumentItem): boolean {
  return Boolean(item.sourceText.trim() || item.targetText.trim() || item.filePath.trim())
}
