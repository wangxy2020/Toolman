import { basename, extname } from 'node:path'
import { existsSync } from 'node:fs'
import {
  extractPdfOutlineEntries,
  extractPdfPageTexts,
  isCourseOutlineNoiseTitle,
  resolveCourseOutline,
  type CourseOutlineEntry,
} from '@toolman/knowledge'
import {
  KnowledgeCourseOutlineInputSchema,
  type KnowledgeCourseOutlineEntry,
} from '@toolman/shared'
import { getDocumentRepository, getKnowledgeBaseRepository } from '../db/repos'
import { isIgnoredKnowledgeDocument } from './knowledge-document/helpers'

/** TOC almost always sits in the front matter — avoid scanning the whole textbook. */
const TOC_TEXT_CHAR_LIMIT = 120_000
const TOC_FRONT_PDF_PAGES = 15

function chapterLabel(title: string): string {
  const trimmed = title
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
  if (!trimmed) return title.replace(/[\u0000-\u001F\u007F]/g, '').trim()
  const withoutExt = trimmed.replace(/\.[A-Za-z0-9]{1,8}$/i, '')
  return withoutExt.trim() || trimmed
}

function isPdfPath(filePath: string | null | undefined): boolean {
  if (!filePath) return false
  return extname(filePath).toLowerCase() === '.pdf'
}

function takeFrontText(plainText: string): string {
  if (plainText.length <= TOC_TEXT_CHAR_LIMIT) return plainText
  return plainText.slice(0, TOC_TEXT_CHAR_LIMIT)
}

async function loadFrontPdfText(filePath: string): Promise<string> {
  try {
    const extracted = await extractPdfPageTexts(filePath, 1, TOC_FRONT_PDF_PAGES)
    return extracted.pages
      .map((page) => page.text?.trim() ?? '')
      .filter(Boolean)
      .join('\n\n')
  } catch {
    return ''
  }
}

async function outlineForDocument(options: {
  documentId: string
  title: string
  absolutePath: string | null
  kbId: string
}): Promise<CourseOutlineEntry[]> {
  const repo = getDocumentRepository()
  const chunkText = takeFrontText(
    repo.listChunkTextsByDocument(options.documentId, options.kbId).join('\n\n'),
  )

  let pdfOutline: CourseOutlineEntry[] = []
  const pdfPath =
    isPdfPath(options.absolutePath) && options.absolutePath && existsSync(options.absolutePath)
      ? options.absolutePath
      : null
  if (pdfPath) {
    pdfOutline = await extractPdfOutlineEntries(pdfPath)
  }
  if (pdfOutline.length >= 2) return pdfOutline

  let plainText = chunkText
  let outline = resolveCourseOutline({
    pdfOutline: pdfOutline.map((entry) => ({ title: entry.title, items: [] })),
    plainText,
  })
  if (outline.length >= 2) return outline

  // Indexed chunks may start after the TOC page, or OCR may miss early pages —
  // retry with the first PDF pages' native text layer when available.
  if (pdfPath) {
    const frontPdfText = takeFrontText(await loadFrontPdfText(pdfPath))
    if (frontPdfText.trim()) {
      plainText = `${frontPdfText}\n\n${chunkText}`
      outline = resolveCourseOutline({
        pdfOutline: pdfOutline.map((entry) => ({ title: entry.title, items: [] })),
        plainText,
      })
    }
  }

  return outline
}

/**
 * Build assistant-lib sidebar catalog for a textbook KB:
 * prefer in-document outline (PDF bookmarks / chapter headings), else document titles.
 */
export async function listKnowledgeCourseOutline(input: unknown): Promise<{
  items: KnowledgeCourseOutlineEntry[]
  fromContent: boolean
}> {
  const data = KnowledgeCourseOutlineInputSchema.parse(input)
  const kbRepo = getKnowledgeBaseRepository()
  const kb =
    kbRepo.findRowById(data.kbId, data.workspaceId) ?? kbRepo.findRowByIdOnly(data.kbId)
  if (!kb) return { items: [], fromContent: false }

  const repo = getDocumentRepository()
  const docs = repo
    .listByKb(data.kbId)
    .filter((row) => !isIgnoredKnowledgeDocument(row))
    .filter((row) => row.status === 'ready' || row.status === 'indexing')
    .sort((left, right) => left.title.localeCompare(right.title, 'zh-CN'))

  const contentChapters: KnowledgeCourseOutlineEntry[] = []
  const fileFallbacks: KnowledgeCourseOutlineEntry[] = []
  const multiDoc = docs.length > 1

  for (const doc of docs) {
    const docTitle = chapterLabel(doc.title || basename(doc.absolutePath ?? ''))
    const docIsNoise = isCourseOutlineNoiseTitle(docTitle)
    const outline = await outlineForDocument({
      documentId: doc.id,
      title: doc.title,
      absolutePath: doc.absolutePath,
      kbId: data.kbId,
    })

    if (!docIsNoise) {
      fileFallbacks.push({
        id: doc.id,
        documentId: doc.id,
        title: doc.title,
        label: docTitle,
        level: 1,
      })
    }

    const usableOutline = outline.filter((entry) => !isCourseOutlineNoiseTitle(entry.title))
    if (usableOutline.length < 2) continue

    // Never prefix with front-matter file names (封面 / 目录).
    const docPrefix = multiDoc && !docIsNoise ? `${docTitle} · ` : ''
    for (const [index, entry] of usableOutline.entries()) {
      contentChapters.push({
        id: `${doc.id}:${index}`,
        documentId: doc.id,
        title: entry.title,
        label: `${docPrefix}${entry.title}`,
        level: entry.level,
      })
    }
  }

  if (contentChapters.length >= 2) {
    return { items: contentChapters, fromContent: true }
  }

  // Include non-ready docs as filename placeholders so the sidebar is not empty mid-ingest.
  const pending = repo
    .listByKb(data.kbId)
    .filter((row) => !isIgnoredKnowledgeDocument(row))
    .filter((row) => row.status !== 'ready' && row.status !== 'indexing' && row.status !== 'failed')
    .filter((doc) => !isCourseOutlineNoiseTitle(chapterLabel(doc.title)))
    .map((doc) => ({
      id: doc.id,
      documentId: doc.id,
      title: doc.title,
      label: chapterLabel(doc.title),
      level: 1 as const,
    }))

  const items = [...fileFallbacks, ...pending].sort((a, b) =>
    a.label.localeCompare(b.label, 'zh-CN'),
  )
  return { items, fromContent: false }
}
