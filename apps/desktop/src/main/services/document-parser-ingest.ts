import { basename } from 'node:path'
import {
  defaultTitle,
  isPdfExtractedTextInsufficient,
  mimeTypeForKind,
  parseFile,
  pickLongestUsableOdlBody,
  splitPdfPagesByMarkers,
  type ParsedDocument,
  type ParseFileOptions,
} from '@toolman/knowledge'
import type { DocumentParseResult } from '@toolman/opendataloader'
import type { OdlHybridBackend, OdlHybridSettings } from '@toolman/shared'
import { logStructured } from './structured-log.service'
import { assertIngestNotCancelled } from './knowledge-ingest-manager.service'
import { resolveOdlHybridSettings, toOdlHybridParseConfig } from './runtime-app-settings.service'
import {
  DEFAULT_ODL_TIMEOUT_MS,
  isHybridServerAvailable,
  normalizeOdlDocumentChannels,
  odlPreviewScanDetected,
  renormalizeOdlPageRangeResult,
  resolvePdfTotalPages,
  runOdlParse,
  shouldUseOpenDataLoaderForPdf,
  type OdlParseRequest,
} from './document-parser-odl-cache'
import { odlPageBodyDisplayable } from './document-parser-translation'

export function emptyOdlResult(): DocumentParseResult {
  return { backend: 'opendataloader', totalPages: 1, plainText: '', markdown: '', pages: [] }
}

function countUsableOdlPages(result: DocumentParseResult): number {
  return result.pages.filter((page) => {
    const text = page.text?.trim() ?? ''
    const markdown = page.markdown?.trim() ?? page.text?.trim() ?? ''
    return odlPageBodyDisplayable(text, markdown)
  }).length
}

function isOdlIngestResultInsufficient(result: DocumentParseResult): boolean {
  if (countUsableOdlPages(result) > 0) return false
  const body = pickLongestUsableOdlBody(result.plainText, result.markdown)
  if (!body.trim()) return true
  const pageCount = Math.max(
    result.totalPages,
    result.pages.length,
    splitPdfPagesByMarkers(result.plainText).length,
    1,
  )
  return isPdfExtractedTextInsufficient(body, pageCount)
}

/** Knowledge ingest Hybrid OCR pages per JVM batch (progress + cancel granularity). */
const KNOWLEDGE_HYBRID_BATCH_SIZE = 16
const KNOWLEDGE_HYBRID_BATCH_TIMEOUT_MIN_MS = 3 * 60 * 1000
const KNOWLEDGE_HYBRID_BATCH_TIMEOUT_MAX_MS = 15 * 60 * 1000

function hybridBackendAttempts(settings: OdlHybridSettings): OdlHybridBackend[] {
  const ordered: OdlHybridBackend[] = ['docling-fast']
  if (settings.backend !== 'docling-fast') ordered.push(settings.backend)
  return ordered
}

/** Try configured hybrid backend, then docling-fast when hancom-ai fails (common local setup). */
export async function runOdlHybridParseWithFallback(
  request: OdlParseRequest,
  timeoutMs: number,
  settings: OdlHybridSettings,
): Promise<DocumentParseResult | null> {
  for (const backend of hybridBackendAttempts(settings)) {
    try {
      const hybrid = normalizeOdlDocumentChannels(
        await runOdlParse(request, timeoutMs, {
          ...toOdlHybridParseConfig({ ...settings, backend }),
          timeoutMs,
        }),
      )
      const rawNonEmpty = hybrid.pages.filter(
        (page) => page.text?.trim() || page.markdown?.trim(),
      ).length
      if (!isOdlIngestResultInsufficient(hybrid) || rawNonEmpty > 0) {
        if (request.pageRange && rawNonEmpty > 0) {
          const pdfTotal = await resolvePdfTotalPages(request.filePath, hybrid.totalPages)
          return renormalizeOdlPageRangeResult(hybrid, request.pageRange, pdfTotal)
        }
        return hybrid
      }
    } catch {
      // Try the next hybrid backend.
    }
  }
  return null
}

/**
 * Local ODL first (fast). When hybrid is enabled and text is insufficient, retry via hybrid server.
 * Returns the best result; caller may still fall back to vision OCR.
 */
export async function parseOdlWithOptionalHybridRetry(
  request: OdlParseRequest,
  timeoutMs: number,
  options?: { skipLocalWarm?: boolean; skipHybrid?: boolean },
): Promise<DocumentParseResult> {
  let local: DocumentParseResult | null = null
  if (!options?.skipLocalWarm) {
    local = await runOdlParse(request, timeoutMs)
    if (!isOdlIngestResultInsufficient(local)) return local
    odlPreviewScanDetected.add(request.filePath)
  } else {
    odlPreviewScanDetected.add(request.filePath)
  }
  if (options?.skipHybrid) return local ?? emptyOdlResult()
  const hybridSettings = resolveOdlHybridSettings()
  if (!hybridSettings.enabled) return local ?? emptyOdlResult()
  const hybridUrl = hybridSettings.url.trim()
  if (!(await isHybridServerAvailable(hybridUrl))) return local ?? emptyOdlResult()
  return (await runOdlHybridParseWithFallback(request, timeoutMs, hybridSettings)) ?? local ?? emptyOdlResult()
}

function toParsedDocument(filePath: string, plainText: string): ParsedDocument {
  return {
    title: defaultTitle(filePath),
    plainText,
    mimeType: mimeTypeForKind('pdf', filePath),
    kind: 'pdf',
  }
}

/**
 * Scanned knowledge PDFs: Hybrid OCR in page batches so UI progress moves and cancel works.
 * Digital PDFs never reach this path (local ODL already returned usable text).
 */
async function parseKnowledgeIngestHybridBatches(options: {
  filePath: string
  parseTimeoutMs: number
  documentId?: string
  onParseProgress?: (currentPage: number, totalPages: number, inProgress?: boolean) => void
}): Promise<DocumentParseResult | null> {
  const { filePath, parseTimeoutMs, documentId, onParseProgress } = options
  const settings = resolveOdlHybridSettings()
  if (!settings.enabled) return null
  const hybridUrl = settings.url.trim()
  if (!(await isHybridServerAvailable(hybridUrl))) {
    logStructured(
      'knowledge-ingest',
      'warn',
      `ODL Hybrid server unavailable at ${hybridUrl || '(empty url)'}; skipping Hybrid`,
    )
    return null
  }

  const totalPages = await resolvePdfTotalPages(filePath)
  const batchCount = Math.max(1, Math.ceil(totalPages / KNOWLEDGE_HYBRID_BATCH_SIZE))
  const batchTimeoutMs = Math.min(
    KNOWLEDGE_HYBRID_BATCH_TIMEOUT_MAX_MS,
    Math.max(KNOWLEDGE_HYBRID_BATCH_TIMEOUT_MIN_MS, Math.floor(parseTimeoutMs / batchCount)),
  )
  logStructured(
    'knowledge-ingest',
    'info',
    `ODL+Hybrid batch OCR for ${basename(filePath)} (${totalPages} pages, batch=${KNOWLEDGE_HYBRID_BATCH_SIZE})`,
  )
  onParseProgress?.(0, totalPages, true)

  const pageByNumber = new Map<number, DocumentParseResult['pages'][number]>()
  for (let start = 1; start <= totalPages; start += KNOWLEDGE_HYBRID_BATCH_SIZE) {
    if (documentId) assertIngestNotCancelled(documentId)
    const end = Math.min(totalPages, start + KNOWLEDGE_HYBRID_BATCH_SIZE - 1)
    onParseProgress?.(start - 1, totalPages, true)
    const batch = await runOdlHybridParseWithFallback(
      { filePath, profile: 'knowledge', pageRange: { start, end } },
      batchTimeoutMs,
      settings,
    )
    if (batch) {
      const normalized = renormalizeOdlPageRangeResult(batch, { start, end }, totalPages)
      for (const page of normalized.pages) {
        const text = page.text?.trim() ?? ''
        const markdown = page.markdown?.trim() ?? text
        if (text || markdown) pageByNumber.set(page.pageNumber, page)
      }
    } else {
      logStructured(
        'knowledge-ingest',
        'warn',
        `ODL+Hybrid batch ${start}-${end}/${totalPages} returned no usable text`,
      )
    }
    onParseProgress?.(end, totalPages, false)
    logStructured(
      'knowledge-ingest',
      'info',
      `ODL+Hybrid batch ${end}/${totalPages} for ${basename(filePath)} (${pageByNumber.size} pages with text)`,
    )
  }
  if (pageByNumber.size === 0) return null
  return normalizeOdlDocumentChannels({
    backend: 'opendataloader',
    totalPages,
    pages: [...pageByNumber.values()].sort((left, right) => left.pageNumber - right.pageNumber),
    plainText: '',
    markdown: '',
  })
}

export async function parseIngestDocumentFile(options: {
  filePath: string
  workspaceId: string
  kbId: string
  parseOptions: ParseFileOptions
  parseTimeoutMs: number
}): Promise<ParsedDocument> {
  const odl = await tryParseIngestWithOdl(options)
  if (odl) return odl
  return parseFile(options.filePath, options.parseOptions)
}

/**
 * Knowledge ingest primary path: ODL local → ODL Hybrid batches (when enabled).
 * Returns null only when ODL/Hybrid is insufficient or failed — caller then uses
 * glm-ocr, and only after that other vision models.
 */
export async function tryParseIngestWithOdl(options: {
  filePath: string
  workspaceId: string
  kbId: string
  parseTimeoutMs: number
  documentId?: string
  onParseProgress?: (currentPage: number, totalPages: number, inProgress?: boolean) => void
}): Promise<ParsedDocument | null> {
  const { filePath, parseTimeoutMs, documentId, onParseProgress } = options
  if (!shouldUseOpenDataLoaderForPdf(filePath)) return null
  const hybridEnabled = resolveOdlHybridSettings().enabled
  logStructured(
    'knowledge-ingest',
    'info',
    `ODL${hybridEnabled ? '+Hybrid' : ''} parsing ${basename(filePath)}`,
  )
  try {
    const local = await parseOdlWithOptionalHybridRetry(
      { filePath, profile: 'knowledge' },
      Math.min(parseTimeoutMs, DEFAULT_ODL_TIMEOUT_MS),
      { skipHybrid: true },
    )
    if (local.plainText.trim() && !isOdlIngestResultInsufficient(local)) {
      logStructured(
        'knowledge-ingest',
        'info',
        `ODL succeeded for ${basename(filePath)} (${local.totalPages} pages)`,
      )
      return toParsedDocument(filePath, local.plainText)
    }
    if (!hybridEnabled) {
      logStructured(
        'knowledge-ingest',
        'info',
        `ODL text insufficient for ${basename(filePath)}; falling back to glm-ocr`,
      )
      return null
    }
    const hybrid = await parseKnowledgeIngestHybridBatches({
      filePath,
      parseTimeoutMs,
      documentId,
      onParseProgress,
    })
    if (hybrid?.plainText.trim() && !isOdlIngestResultInsufficient(hybrid)) {
      logStructured(
        'knowledge-ingest',
        'info',
        `ODL+Hybrid succeeded for ${basename(filePath)} (${hybrid.totalPages} pages)`,
      )
      return toParsedDocument(filePath, hybrid.plainText)
    }
    logStructured(
      'knowledge-ingest',
      'info',
      `ODL+Hybrid text insufficient for ${basename(filePath)}; falling back to glm-ocr`,
    )
  } catch (error) {
    logStructured(
      'knowledge-ingest',
      'warn',
      `ODL${hybridEnabled ? '+Hybrid' : ''} failed for ${basename(filePath)}`,
      { error: error instanceof Error ? error.message : String(error) },
    )
  }
  return null
}
