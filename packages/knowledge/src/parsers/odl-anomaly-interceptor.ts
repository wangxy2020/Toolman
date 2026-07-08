/**
 * Data Anomaly Interceptor for OpenDataLoader / OCR parse output.
 *
 * Detects OCR collapse hallucinations (e.g. infinite "27" lines on sparse scans)
 * and salvages usable text while marking noisy pages in metadata.
 */

import { postProcessOdlPreviewContent, odlContentToPlainText } from './odl-preview-text.js'

/** Configurable thresholds for anomaly detection. */
export interface OdlAnomalyDetectionConfig {
  /** Consecutive identical short lines required to flag collapse (default 15). */
  consecutiveDuplicateLines: number
  /** Max normalized line length treated as "short" for collapse detection (default 5). */
  maxShortLineLength: number
  /** Minimum unique-char ratio; below this triggers low-entropy intercept (default 0.05 = 5%). */
  minUniqueCharRatio: number
}

export const DEFAULT_ODL_ANOMALY_DETECTION_CONFIG: OdlAnomalyDetectionConfig = {
  consecutiveDuplicateLines: 15,
  maxShortLineLength: 5,
  minUniqueCharRatio: 0.05,
}

export type OdlAnomalyReason =
  | 'consecutive_duplicate_short_lines'
  | 'low_unique_char_ratio'
  | 'empty_after_noise_removal'

export interface OdlAnomalyDetectionResult {
  isAnomaly: boolean
  reasons: OdlAnomalyReason[]
  /** Longest run of consecutive duplicate normalized lines. */
  maxConsecutiveDuplicateRun: number
  /** Ratio of unique characters to total non-whitespace characters. */
  uniqueCharRatio: number
}

export interface OdlAnomalyInterceptResult {
  /** Original page text before interception. */
  originalText: string
  /** Cleaned text after noise removal / salvage. */
  cleanedText: string
  /** True when the page is mostly blank or OCR noise. */
  isBlankOrNoise: boolean
  detection: OdlAnomalyDetectionResult
  /** Whether a retry with stricter detection settings is recommended. */
  shouldRetryParse: boolean
}

function normalizeLineKey(line: string): string {
  return line.trim().replace(/\s+/g, '')
}

function splitMeaningfulLines(text: string): string[] {
  const plain = odlContentToPlainText(text)
  return plain
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

/**
 * Find the longest run of consecutive lines that normalize to the same key.
 */
export function findMaxConsecutiveDuplicateRun(lines: string[]): number {
  let maxRun = 0
  let run = 0
  let previousKey = ''

  for (const line of lines) {
    const key = normalizeLineKey(line)
    if (!key) {
      run = 0
      previousKey = ''
      continue
    }
    if (key === previousKey) {
      run += 1
    } else {
      run = 1
      previousKey = key
    }
    maxRun = Math.max(maxRun, run)
  }

  return maxRun
}

/**
 * Shannon entropy over character frequency (bits per character).
 * Used as a secondary signal; primary gate is unique-char ratio.
 */
export function computeTextEntropy(text: string): number {
  const chars = text.replace(/\s+/g, '')
  if (chars.length === 0) return 0

  const counts = new Map<string, number>()
  for (const char of chars) {
    counts.set(char, (counts.get(char) ?? 0) + 1)
  }

  let entropy = 0
  for (const count of counts.values()) {
    const probability = count / chars.length
    entropy -= probability * Math.log2(probability)
  }
  return entropy
}

/**
 * Ratio of distinct characters to total non-whitespace characters.
 * OCR collapse on "27" yields a very low ratio on pages with many repeated digits.
 */
export function computeUniqueCharRatio(text: string): number {
  const chars = text.replace(/\s+/g, '')
  if (chars.length === 0) return 1
  return new Set(chars).size / chars.length
}

/**
 * Detect OCR collapse / hallucination patterns in a single page's text.
 */
export function detectOdlPageAnomaly(
  text: string,
  config: Partial<OdlAnomalyDetectionConfig> = {},
): OdlAnomalyDetectionResult {
  const resolved: OdlAnomalyDetectionConfig = {
    ...DEFAULT_ODL_ANOMALY_DETECTION_CONFIG,
    ...config,
  }

  const lines = splitMeaningfulLines(text)
  const maxConsecutiveDuplicateRun = findMaxConsecutiveDuplicateRun(lines)
  const uniqueCharRatio = computeUniqueCharRatio(odlContentToPlainText(text))

  const reasons: OdlAnomalyReason[] = []

  if (maxConsecutiveDuplicateRun >= resolved.consecutiveDuplicateLines) {
    const dominantKey = normalizeLineKey(lines[lines.length - 1] ?? '')
    if (dominantKey.length <= resolved.maxShortLineLength) {
      reasons.push('consecutive_duplicate_short_lines')
    }
  }

  if (uniqueCharRatio < resolved.minUniqueCharRatio && lines.length >= resolved.consecutiveDuplicateLines) {
    reasons.push('low_unique_char_ratio')
  }

  return {
    isAnomaly: reasons.length > 0,
    reasons,
    maxConsecutiveDuplicateRun,
    uniqueCharRatio,
  }
}

/**
 * Remove collapsed OCR noise runs (blank lines do not break duplicate counting).
 */
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
