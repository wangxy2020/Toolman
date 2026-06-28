/** Minimum parse timeout — large PDFs / Office docs may take a long time. */
const PARSE_BASE_MS = 20 * 60 * 1000
const PARSE_MS_PER_MB = 90 * 1000
const PARSE_MAX_MS = 2 * 60 * 60 * 1000

/** Minimum embed timeout — scales gently with extracted text length. */
const EMBED_BASE_MS = 10 * 60 * 1000
const EMBED_MS_PER_100K_CHARS = 30 * 1000
const EMBED_MAX_MS = 2 * 60 * 60 * 1000

/** Jobs running longer than this are marked stale (must exceed max parse + embed). */
export const STALE_INGEST_MS = 9 * 60 * 60 * 1000

export function resolveParseTimeoutMs(fileSizeBytes: number): number {
  if (fileSizeBytes <= 0) return PARSE_BASE_MS
  const fileMb = fileSizeBytes / (1024 * 1024)
  return Math.min(PARSE_BASE_MS + Math.ceil(fileMb) * PARSE_MS_PER_MB, PARSE_MAX_MS)
}

export function resolveEmbedTimeoutMs(plainTextLength: number): number {
  if (plainTextLength <= 0) return EMBED_BASE_MS
  const units = Math.ceil(plainTextLength / 100_000)
  return Math.min(EMBED_BASE_MS + units * EMBED_MS_PER_100K_CHARS, EMBED_MAX_MS)
}
