import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import type { DocumentPageText, DocumentParseResult } from './types.js'
import { formatPdfPageMarker, isPdfPageMarkerOnly, splitPdfPagesByMarkers } from './page-markers.js'

function baseNameWithoutExt(filePath: string): string {
  return basename(filePath, extname(filePath))
}

function findOutputFile(outputDir: string, sourcePath: string, ext: string): string | null {
  const preferred = join(outputDir, `${baseNameWithoutExt(sourcePath)}${ext}`)
  if (existsSync(preferred)) return preferred

  const matches = readdirSync(outputDir).filter((name) => name.toLowerCase().endsWith(ext.toLowerCase()))
  if (matches.length === 1) {
    return join(outputDir, matches[0]!)
  }

  const sourceBase = baseNameWithoutExt(sourcePath).toLowerCase()
  const fuzzy = matches.find((name) => {
    const stem = basename(name, extname(name)).toLowerCase()
    return stem === sourceBase || stem.startsWith(sourceBase) || sourceBase.startsWith(stem)
  })
  return fuzzy ? join(outputDir, fuzzy) : null
}

function readTextFile(path: string | null): string {
  if (!path || !existsSync(path)) return ''
  return readFileSync(path, 'utf8').trim()
}

interface JsonPageRecord {
  pageNumber?: number
  number?: number
  width?: number
  height?: number
  text?: string
  content?: string
}

interface JsonDocumentShape {
  metadata?: {
    pageCount?: number
    page_count?: number
    pages?: number
    width?: number
    height?: number
  }
  pages?: JsonPageRecord[]
  pageCount?: number
  page_count?: number
}

function readJsonDocument(path: string | null): JsonDocumentShape | null {
  if (!path || !existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as JsonDocumentShape
  } catch {
    return null
  }
}

function resolveTotalPages(
  json: JsonDocumentShape | null,
  pages: DocumentPageText[],
  plainFromText: string,
  markdown: string,
): number {
  const fromJson =
    json?.metadata?.pageCount ??
    json?.metadata?.page_count ??
    json?.metadata?.pages ??
    json?.pageCount ??
    json?.page_count
  if (typeof fromJson === 'number' && fromJson > 0) return fromJson
  if (pages.length > 0) return Math.max(...pages.map((page) => page.pageNumber))
  if (json?.pages?.length) {
    return Math.max(
      ...json.pages
        .map((page) => page.pageNumber ?? page.number ?? 0)
        .filter((value) => value > 0),
    )
  }
  const markerPages = splitPdfPagesByMarkers(plainFromText)
  if (markerPages.length > 0) {
    return Math.max(...markerPages.map((page) => page.pageNumber))
  }
  const markdownMarkers = [...markdown.matchAll(/【第 (\d+) 页(?:\/\d+)?】/g)]
  if (markdownMarkers.length > 0) {
    return Math.max(...markdownMarkers.map((match) => Number(match[1])).filter((value) => value > 0))
  }
  return pages.length
}

function resolvePageDimensions(json: JsonDocumentShape | null): {
  pageWidth?: number
  pageHeight?: number
} {
  const metaWidth = json?.metadata?.width
  const metaHeight = json?.metadata?.height
  if (metaWidth && metaHeight) {
    return { pageWidth: metaWidth, pageHeight: metaHeight }
  }

  const first = json?.pages?.[0]
  if (first?.width && first?.height) {
    return { pageWidth: first.width, pageHeight: first.height }
  }
  return {}
}

function pagesFromJson(json: JsonDocumentShape | null): DocumentPageText[] {
  if (!json?.pages?.length) return []
  return json.pages
    .map((page) => {
      const pageNumber = page.pageNumber ?? page.number
      const text = (page.text ?? page.content ?? '').trim()
      if (!pageNumber || !text) return null
      return { pageNumber, text }
    })
    .filter((page): page is DocumentPageText => page !== null)
    .sort((left, right) => left.pageNumber - right.pageNumber)
}

function buildPlainTextFromPages(pages: DocumentPageText[], totalPages: number): string {
  if (pages.length === 0) return ''
  return pages
    .map((page) => `${formatPdfPageMarker(page.pageNumber, totalPages)}\n${page.text}`)
    .join('\n\n')
    .trim()
}

function mergePageRecords(
  primary: DocumentPageText[],
  secondary: Array<{ pageNumber: number; text: string }>,
): DocumentPageText[] {
  const byPage = new Map(primary.map((page) => [page.pageNumber, page]))

  for (const page of secondary) {
    const candidate = page.text.trim()
    if (!candidate || isPdfPageMarkerOnly(candidate)) continue

    const existing = byPage.get(page.pageNumber)
    const existingBody = existing?.text.trim() ?? ''
    if (!existing || isPdfPageMarkerOnly(existingBody) || candidate.length > existingBody.length) {
      byPage.set(page.pageNumber, { pageNumber: page.pageNumber, text: candidate })
    }
  }

  return [...byPage.values()].sort((left, right) => left.pageNumber - right.pageNumber)
}

function assignUnpaginatedPageRecords(
  pageRecords: DocumentPageText[],
  content: string,
  pageRange?: { start: number; end: number },
): DocumentPageText[] {
  if (pageRecords.length > 0) return pageRecords
  if (!pageRange || pageRange.start !== pageRange.end) return pageRecords

  const trimmed = content.trim()
  if (!trimmed || isPdfPageMarkerOnly(trimmed)) return pageRecords

  return [{ pageNumber: pageRange.start, text: trimmed }]
}

function pageRecordsFromMarkerSplit(
  pages: Array<{ pageNumber: number; text: string }>,
): DocumentPageText[] {
  return pages
    .map((page) => ({
      pageNumber: page.pageNumber,
      text: page.text.trim(),
    }))
    .filter((page) => page.text.length > 0 && !isPdfPageMarkerOnly(page.text))
}

export function parseOpenDataLoaderOutput(input: {
  sourcePath: string
  outputDir: string
  /** When ODL omits page markers (common for single-page extracts), assign text to this range. */
  pageRange?: { start: number; end: number }
}): Omit<DocumentParseResult, 'backend'> {
  const textPath = findOutputFile(input.outputDir, input.sourcePath, '.txt')
  const markdownPath = findOutputFile(input.outputDir, input.sourcePath, '.md')
  const jsonPath = findOutputFile(input.outputDir, input.sourcePath, '.json')

  const plainFromText = readTextFile(textPath)
  const markdown = readTextFile(markdownPath)
  const json = readJsonDocument(jsonPath)

  let pages = splitPdfPagesByMarkers(plainFromText)
  if (pages.length === 0) {
    pages = pagesFromJson(json)
  }

  let pageRecords = pageRecordsFromMarkerSplit(pages)
  pageRecords = mergePageRecords(pageRecords, splitPdfPagesByMarkers(markdown))
  pageRecords = assignUnpaginatedPageRecords(pageRecords, plainFromText, input.pageRange)
  pageRecords = assignUnpaginatedPageRecords(pageRecords, markdown, input.pageRange)

  const totalPages = resolveTotalPages(json, pageRecords, plainFromText, markdown)
  const plainText =
    pageRecords.length > 0
      ? buildPlainTextFromPages(pageRecords, totalPages)
      : plainFromText.trim() || markdown.trim()

  const dimensions = resolvePageDimensions(json)
  const markdownOut =
    markdown.trim() ||
    pageRecords.map((page) => page.text).join('\n\n').trim() ||
    plainText

  return {
    totalPages,
    plainText,
    markdown: markdownOut,
    pages: pageRecords,
    pageWidth: dimensions.pageWidth,
    pageHeight: dimensions.pageHeight,
    jsonPath: jsonPath ?? undefined,
  }
}

export function findOutputFileForTest(
  outputDir: string,
  sourcePath: string,
  ext: string,
): string | null {
  return findOutputFile(outputDir, sourcePath, ext)
}
