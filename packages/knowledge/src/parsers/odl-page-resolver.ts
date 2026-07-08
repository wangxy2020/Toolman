/**
 * Resolve per-page ODL content from all output channels (pages array, plainText, markdown).
 * Ensures post-process / anomaly intercept runs even when merge logic picked the longest noisy body.
 */

import { isPdfPageMarkerOnly, splitPdfPagesByMarkers } from './pdf-page-markers.js'
import {
  interceptOdlPageAnomaly,
  type OdlAnomalyDetectionConfig,
  type OdlAnomalyInterceptResult,
} from './odl-anomaly-interceptor.js'
import { pickBestSanitizedOdlBody, postProcessOdlPreviewContent } from './odl-preview-text.js'

export interface OdlPageSourceDocument {
  pages: Array<{ pageNumber: number; text: string; markdown?: string }>
  plainText: string
  markdown: string
  totalPages: number
}

export interface ResolvedOdlPage {
  pageNumber: number
  text: string
  markdown?: string
  isBlankOrNoise?: boolean
  anomalyReasons?: string[]
}

function addCandidate(map: Map<number, string[]>, pageNumber: number, text: string): void {
  const trimmed = text.trim()
  if (!trimmed || isPdfPageMarkerOnly(trimmed)) return
  const list = map.get(pageNumber) ?? []
  if (!list.includes(trimmed)) list.push(trimmed)
  map.set(pageNumber, list)
}

/** Gather every per-page body ODL emitted across txt/md/json channels. */
export function collectOdlPageCandidates(document: OdlPageSourceDocument): Map<number, string[]> {
  const map = new Map<number, string[]>()

  for (const page of splitPdfPagesByMarkers(document.plainText)) {
    addCandidate(map, page.pageNumber, page.text)
  }
  for (const page of splitPdfPagesByMarkers(document.markdown)) {
    addCandidate(map, page.pageNumber, page.text)
  }
  for (const page of document.pages) {
    addCandidate(map, page.pageNumber, page.text)
    if (page.markdown?.trim()) addCandidate(map, page.pageNumber, page.markdown)
  }

  return map
}

/** Prefer cleaned non-anomalous bodies; never select raw spam by length alone. */
export function pickBestInterceptedOdlBody(
  ...sources: Array<string | undefined | null>
): OdlAnomalyInterceptResult {
  return pickBestInterceptedOdlBodyWithConfig(undefined, ...sources)
}

export function pickBestInterceptedOdlBodyWithConfig(
  config: Partial<OdlAnomalyDetectionConfig> | undefined,
  ...sources: Array<string | undefined | null>
): OdlAnomalyInterceptResult {
  let best: OdlAnomalyInterceptResult | null = null

  for (const source of sources) {
    if (!source?.trim()) continue
    const intercept = interceptOdlPageAnomaly(source, config)
    if (!best) {
      best = intercept
      continue
    }

    const bestAnomaly = best.detection.isAnomaly
    const nextAnomaly = intercept.detection.isAnomaly
    if (!nextAnomaly && bestAnomaly) {
      best = intercept
      continue
    }
    if (nextAnomaly && !bestAnomaly) continue

    const bestLen = best.cleanedText.trim().length
    const nextLen = intercept.cleanedText.trim().length
    if (nextLen > bestLen) best = intercept
  }

  if (best) return best

  const fallback = pickBestSanitizedOdlBody(...sources)
  return {
    originalText: fallback,
    cleanedText: fallback,
    isBlankOrNoise: !fallback,
    detection: {
      isAnomaly: false,
      reasons: [],
      maxConsecutiveDuplicateRun: 0,
      uniqueCharRatio: 1,
    },
    shouldRetryParse: false,
  }
}

/** Resolve one page from all ODL channels with intercept + sanitize. */
export function resolveOdlPageContent(
  pageNumber: number,
  document: OdlPageSourceDocument,
  config?: Partial<OdlAnomalyDetectionConfig>,
): ResolvedOdlPage {
  const candidates = collectOdlPageCandidates(document).get(pageNumber) ?? []
  const fromPages = document.pages.find((page) => page.pageNumber === pageNumber)
  if (fromPages?.text.trim()) candidates.push(fromPages.text.trim())
  if (fromPages?.markdown?.trim()) candidates.push(fromPages.markdown.trim())

  const uniqueCandidates = [...new Set(candidates)]
  const intercept = pickBestInterceptedOdlBodyWithConfig(config, ...uniqueCandidates)
  const cleaned =
    uniqueCandidates.length > 0
      ? intercept.cleanedText
      : postProcessOdlPreviewContent(fromPages?.text ?? '')

  return {
    pageNumber,
    text: cleaned,
    markdown: cleaned,
    isBlankOrNoise: intercept.isBlankOrNoise,
    anomalyReasons: intercept.detection.isAnomaly ? intercept.detection.reasons : undefined,
  }
}

/** Rebuild guarded document pages from all ODL output channels. */
export function guardOdlDocumentPages(
  document: OdlPageSourceDocument,
  config?: Partial<OdlAnomalyDetectionConfig>,
): ResolvedOdlPage[] {
  const candidates = collectOdlPageCandidates(document)
  const pageNumbers = new Set<number>([
    ...candidates.keys(),
    ...document.pages.map((page) => page.pageNumber),
  ])

  return [...pageNumbers]
    .sort((left, right) => left - right)
    .map((pageNumber) => resolveOdlPageContent(pageNumber, document, config))
}
