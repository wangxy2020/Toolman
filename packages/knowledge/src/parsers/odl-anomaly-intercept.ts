import { postProcessOdlPreviewContent } from './odl-preview-text.js'
import {
  DEFAULT_ODL_ANOMALY_DETECTION_CONFIG,
  detectOdlPageAnomaly,
  normalizeLineKey,
  splitMeaningfulLines,
  type OdlAnomalyDetectionConfig,
  type OdlAnomalyInterceptResult,
  type OdlAnomalyReason,
} from './odl-anomaly-detect.js'

export function stripConsecutiveDuplicateNoise(
  text: string,
  config: Partial<OdlAnomalyDetectionConfig> = {},
): string {
  const resolved: OdlAnomalyDetectionConfig = {
    ...DEFAULT_ODL_ANOMALY_DETECTION_CONFIG,
    ...config,
  }

  const lines = splitMeaningfulLines(text)
  if (lines.length === 0) return ''

  let dominantKey = ''
  let dominantRun = 0
  let runKey = ''
  let run = 0

  for (const line of lines) {
    const key = normalizeLineKey(line)
    if (key === runKey) {
      run += 1
    } else {
      if (run > dominantRun) {
        dominantRun = run
        dominantKey = runKey
      }
      runKey = key
      run = 1
    }
  }
  if (run > dominantRun) {
    dominantRun = run
    dominantKey = runKey
  }

  const isNoiseRun =
    dominantRun >= resolved.consecutiveDuplicateLines &&
    dominantKey.length <= resolved.maxShortLineLength

  if (!isNoiseRun) return text.trim()

  const kept = lines.filter((line) => normalizeLineKey(line) !== dominantKey)
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * Salvage non-noise lines from a page flagged as OCR collapse.
 * Applies layout cleanup via postProcessOdlPreviewContent.
 */
export function salvageOdlPageText(
  text: string,
  config: Partial<OdlAnomalyDetectionConfig> = {},
): string {
  const stripped = stripConsecutiveDuplicateNoise(text, config)
  return postProcessOdlPreviewContent(stripped)
}

/**
 * Full per-page intercept: detect → salvage → attach metadata flags.
 */
export function interceptOdlPageAnomaly(
  text: string,
  config: Partial<OdlAnomalyDetectionConfig> = {},
): OdlAnomalyInterceptResult {
  const trimmed = text.trim()
  const detection = detectOdlPageAnomaly(trimmed, config)

  if (!detection.isAnomaly) {
    const cleaned = postProcessOdlPreviewContent(trimmed)
    return {
      originalText: trimmed,
      cleanedText: cleaned,
      isBlankOrNoise: false,
      detection,
      shouldRetryParse: false,
    }
  }

  const cleaned = salvageOdlPageText(trimmed, config)
  const salvageLines = splitMeaningfulLines(cleaned)
  const maxShort = config.maxShortLineLength ?? DEFAULT_ODL_ANOMALY_DETECTION_CONFIG.maxShortLineLength

  // Drop isolated short numeric debris when meaningful text remains on the page.
  const hasMeaningfulText = salvageLines.some(
    (line) => normalizeLineKey(line).length > maxShort || !/^\d{1,4}$/.test(line.trim()),
  )
  const filteredLines = hasMeaningfulText
    ? salvageLines.filter((line) => {
        const key = normalizeLineKey(line)
        return !(key.length <= maxShort && /^\d{1,4}$/.test(key))
      })
    : []
  const finalCleaned = filteredLines.join('\n').trim()

  const isBlankOrNoise =
    filteredLines.length === 0 ||
    filteredLines.every((line) => normalizeLineKey(line).length <= maxShort)

  return {
    originalText: trimmed,
    cleanedText: finalCleaned,
    isBlankOrNoise,
    detection: {
      ...detection,
      reasons: isBlankOrNoise && salvageLines.length === 0
        ? [...detection.reasons, 'empty_after_noise_removal']
        : detection.reasons,
    },
    shouldRetryParse: true,
  }
}

export interface OdlPageWithAnomalyMeta {
  pageNumber: number
  text: string
  markdown?: string
  isBlankOrNoise?: boolean
  anomalyReasons?: OdlAnomalyReason[]
}

/**
 * Apply anomaly interception to all pages in an ODL parse result.
 */
export function interceptOdlDocumentPages(
  pages: Array<{ pageNumber: number; text: string; markdown?: string }>,
  config: Partial<OdlAnomalyDetectionConfig> = {},
): {
  pages: OdlPageWithAnomalyMeta[]
  anomalousPageNumbers: number[]
  shouldRetryPageNumbers: number[]
} {
  const anomalousPageNumbers: number[] = []
  const shouldRetryPageNumbers: number[] = []

  const nextPages = pages.map((page) => {
    const intercept = interceptOdlPageAnomaly(page.text, config)
    if (intercept.detection.isAnomaly) {
      anomalousPageNumbers.push(page.pageNumber)
    }
    if (intercept.shouldRetryParse) {
      shouldRetryPageNumbers.push(page.pageNumber)
    }

    return {
      pageNumber: page.pageNumber,
      text: intercept.cleanedText,
      markdown: page.markdown ? intercept.cleanedText : undefined,
      isBlankOrNoise: intercept.isBlankOrNoise,
      anomalyReasons: intercept.detection.reasons,
    }
  })

  return { pages: nextPages, anomalousPageNumbers, shouldRetryPageNumbers }
}

/** Mock fixture reproducing image_1dc076.jpg style OCR collapse (Tanzania contract page 8). */
export function buildMockOcrCollapsePageText(): string {
  return [
    'Click Download to see negotiation minutes.',
    'SAR',
    ...Array.from({ length: 45 }, () => '27'),
  ].join('\n')
}

