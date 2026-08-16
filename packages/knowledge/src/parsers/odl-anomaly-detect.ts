/**
 * Data Anomaly Interceptor for OpenDataLoader / OCR parse output.
 *
 * Detects OCR collapse hallucinations (e.g. infinite "27" lines on sparse scans)
 * and salvages usable text while marking noisy pages in metadata.
 */

import { odlContentToPlainText } from './odl-preview-text.js'

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

export function normalizeLineKey(line: string): string {
  return line.trim().replace(/\s+/g, '')
}

export function splitMeaningfulLines(text: string): string[] {
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
