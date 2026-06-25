export type DocumentReviewIssueSeverity = 'high' | 'medium' | 'low'

export const DOCUMENT_REVIEW_SEVERITIES = new Set<DocumentReviewIssueSeverity>([
  'high',
  'medium',
  'low',
])

export interface DocumentToolBatchStats {
  applied: number
  failed: number
}

export function parseDocumentReviewSeverity(raw: unknown): DocumentReviewIssueSeverity {
  const severity = String(raw ?? 'medium').toLowerCase() as DocumentReviewIssueSeverity
  return DOCUMENT_REVIEW_SEVERITIES.has(severity) ? severity : 'medium'
}

export function clampDocumentToolBatchStats(
  requested: number,
  applied: number,
  failed: number,
): DocumentToolBatchStats {
  return {
    applied: Math.max(0, Math.min(requested, applied)),
    failed: Math.max(0, Math.min(requested, failed)),
  }
}

export function isDocumentToolHardFailure(result: string): boolean {
  const trimmed = result.trim()
  return trimmed.startsWith('Error:') || /^UNTRACKED_EDIT_NOT_ALLOWED/i.test(trimmed)
}

export function extractJsonObjectFromToolResult(result: string): Record<string, unknown> | null {
  const jsonStart = result.indexOf('{')
  const jsonEnd = result.lastIndexOf('}')
  if (jsonStart === -1 || jsonEnd <= jsonStart) return null
  try {
    return JSON.parse(result.slice(jsonStart, jsonEnd + 1)) as Record<string, unknown>
  } catch {
    return null
  }
}

export function countExcelToolApplyResult(
  result: string,
  kind: 'modify' | 'highlight',
): { applied: number; failed: number } {
  const parsed = extractJsonObjectFromToolResult(result)
  if (parsed) {
    if (kind === 'modify' && typeof parsed.updatedCount === 'number') {
      const failed = Array.isArray(parsed.applied)
        ? parsed.applied.filter((item) => item?.status === 'skipped').length
        : 0
      return { applied: parsed.updatedCount, failed }
    }
    if (kind === 'highlight' && typeof parsed.highlightedCount === 'number') {
      const failed = Array.isArray(parsed.applied)
        ? parsed.applied.filter((item) => item?.status === 'skipped').length
        : 0
      return { applied: parsed.highlightedCount, failed }
    }
    if (Array.isArray(parsed.applied)) {
      const applied = parsed.applied.filter((item) => item?.status === 'updated').length
      const failed = parsed.applied.filter((item) => item?.status === 'skipped').length
      return { applied, failed }
    }
  }

  const failed = (result.match(/"status":\s*"skipped"/g) ?? []).length
  const updated = (result.match(/"status":\s*"updated"/g) ?? []).length
  return { applied: updated, failed }
}
