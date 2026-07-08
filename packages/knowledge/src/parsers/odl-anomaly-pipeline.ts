/**
 * Orchestrates anomaly detection, salvage, and optional ODL re-parse retry
 * for pages flagged with OCR collapse hallucinations.
 */

import {
  guardOdlDocumentPages,
  type OdlPageSourceDocument,
} from './odl-page-resolver.js'
import { formatPdfPageMarker } from './pdf-page-markers.js'

export interface OdlAnomalyPipelinePage {
  pageNumber: number
  text: string
  markdown?: string
  isBlankOrNoise?: boolean
  anomalyReasons?: string[]
}

export interface OdlAnomalyPipelineInput {
  pages: OdlAnomalyPipelinePage[]
  plainText: string
  markdown: string
  totalPages: number
}

export interface OdlAnomalyPipelineResult extends OdlAnomalyPipelineInput {
  anomalousPageNumbers: number[]
  retriedPageNumbers: number[]
}

export interface OdlAnomalyRetryContext {
  filePath: string
  password?: string
  /** Re-parse a single page with stricter detection settings. */
  retryPage: (pageNumber: number) => Promise<OdlAnomalyPipelinePage | null>
}

/**
 * Mechanism A: detect anomalies, salvage valid text, mark is_blank_or_noise.
 * Mechanism B (optional): re-parse flagged pages via retryPage callback.
 */
export async function runOdlAnomalyPipeline(
  input: OdlAnomalyPipelineInput,
  options?: {
    config?: Partial<import('./odl-anomaly-interceptor.js').OdlAnomalyDetectionConfig>
    retry?: OdlAnomalyRetryContext
    /** Minimum det_threshold for retry passes (default 0.8). */
    retryDetThreshold?: number
  },
): Promise<OdlAnomalyPipelineResult> {
  const sourceDocument: OdlPageSourceDocument = {
    pages: input.pages,
    plainText: input.plainText,
    markdown: input.markdown,
    totalPages: input.totalPages,
  }

  const guardedPages = guardOdlDocumentPages(sourceDocument, options?.config)
  const anomalousPageNumbers = guardedPages
    .filter((page) => page.anomalyReasons?.length)
    .map((page) => page.pageNumber)
  const shouldRetryPageNumbers = guardedPages
    .filter((page) => page.anomalyReasons?.length && !page.isBlankOrNoise)
    .map((page) => page.pageNumber)

  const pageByNumber = new Map(guardedPages.map((page) => [page.pageNumber, { ...page }]))
  const retriedPageNumbers: number[] = []

  if (options?.retry && shouldRetryPageNumbers.length > 0) {
    for (const pageNumber of shouldRetryPageNumbers) {
      try {
        const retried = await options.retry.retryPage(pageNumber)
        if (!retried?.text?.trim()) continue

        const retriedDocument: OdlPageSourceDocument = {
          pages: [{ pageNumber, text: retried.text, markdown: retried.markdown ?? retried.text }],
          plainText: retried.text,
          markdown: retried.markdown ?? retried.text,
          totalPages: input.totalPages,
        }
        const reResolved = guardOdlDocumentPages(retriedDocument, options?.config)[0]
        if (!reResolved) continue

        const existing = pageByNumber.get(pageNumber)
        const retryBetter =
          reResolved.text.length > (existing?.text.length ?? 0) && !reResolved.isBlankOrNoise

        pageByNumber.set(pageNumber, retryBetter ? reResolved : (existing ?? reResolved))
        retriedPageNumbers.push(pageNumber)
      } catch {
        // Graceful fallback: keep salvaged text from mechanism A.
      }
    }
  }

  const pages = [...pageByNumber.values()].sort((left, right) => left.pageNumber - right.pageNumber)
  const totalPages = Math.max(input.totalPages, ...pages.map((page) => page.pageNumber), 0)

  const plainText =
    pages.length > 0
      ? pages
          .map((page) => `${formatPdfPageMarker(page.pageNumber, totalPages)}\n${page.text}`)
          .join('\n\n')
          .trim()
      : input.plainText

  const markdown =
    pages.length > 0
      ? pages.map((page) => page.markdown ?? page.text).join('\n\n').trim()
      : input.markdown

  return {
    pages,
    plainText,
    markdown,
    totalPages,
    anomalousPageNumbers,
    retriedPageNumbers,
  }
}
