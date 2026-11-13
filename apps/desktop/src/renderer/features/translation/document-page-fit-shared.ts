import {
  DOCUMENT_PAGE_FIT_PROSE_CAPS,
  type DocumentPageFitCaps,
  type DocumentPageFitStyle,
} from './document-page-fit'

export type DocumentFitKind = 'prose' | 'table'

type SharedBucket = {
  /** Natural per-page font sizes that feed the document median. */
  samples: Map<number, number>
  shared: DocumentPageFitStyle | null
}

const buckets = new Map<string, SharedBucket>()
const listeners = new Set<() => void>()

function bucketKey(documentId: string, kind: DocumentFitKind): string {
  return `${documentId}::${kind}`
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

/** Median of positive numbers; empty → null. */
export function medianFontSize(values: number[]): number | null {
  const sorted = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b)
  if (sorted.length === 0) return null
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return round1(sorted[mid]!)
  return round1((sorted[mid - 1]! + sorted[mid]!) / 2)
}

/** Blend line/pad between caps so a shared 字号 still looks balanced. */
export function styleForSharedFontSize(
  fontSize: number,
  caps: DocumentPageFitCaps = DOCUMENT_PAGE_FIT_PROSE_CAPS,
): DocumentPageFitStyle {
  const span = Math.max(0.01, caps.fontMax - caps.fontMin)
  const t = Math.max(0, Math.min(1, (fontSize - caps.fontMin) / span))
  return {
    fontSize: round1(Math.max(caps.fontMin, Math.min(caps.fontMax, fontSize))),
    lineHeight: Math.round((caps.lineMin + (caps.lineMax - caps.lineMin) * t) * 100) / 100,
    padding: Math.round(caps.padMin + (caps.padMax - caps.padMin) * t),
    scale: 1,
  }
}

function rebuildShared(bucket: SharedBucket, caps: DocumentPageFitCaps): DocumentPageFitStyle | null {
  const median = medianFontSize([...bucket.samples.values()])
  if (median == null) {
    bucket.shared = null
    return null
  }
  bucket.shared = styleForSharedFontSize(median, caps)
  return bucket.shared
}

function notify() {
  for (const listener of listeners) listener()
}

function getBucket(documentId: string, kind: DocumentFitKind): SharedBucket {
  const key = bucketKey(documentId, kind)
  let bucket = buckets.get(key)
  if (!bucket) {
    bucket = { samples: new Map(), shared: null }
    buckets.set(key, bucket)
  }
  return bucket
}

/** Contribute one page's natural fit; returns the updated document shared style. */
export function reportDocumentPageNaturalFit(options: {
  documentId: string
  pageNumber: number
  kind: DocumentFitKind
  fontSize: number
  caps?: DocumentPageFitCaps
}): DocumentPageFitStyle {
  const caps = options.caps ?? DOCUMENT_PAGE_FIT_PROSE_CAPS
  const bucket = getBucket(options.documentId, options.kind)
  const clamped = round1(Math.max(caps.fontMin, Math.min(caps.fontMax, options.fontSize)))
  const previousShared = bucket.shared?.fontSize
  bucket.samples.set(options.pageNumber, clamped)
  const shared = rebuildShared(bucket, caps) ?? styleForSharedFontSize(clamped, caps)
  if (previousShared !== shared.fontSize) notify()
  return shared
}

export function getSharedDocumentPageFit(
  documentId: string | null | undefined,
  kind: DocumentFitKind,
): DocumentPageFitStyle | null {
  if (!documentId) return null
  return buckets.get(bucketKey(documentId, kind))?.shared ?? null
}

/** Seed from saved page fits so reopen starts near the document median. */
export function seedDocumentPageNaturalFit(options: {
  documentId: string
  pageNumber: number
  kind: DocumentFitKind
  fontSize: number
  caps?: DocumentPageFitCaps
}): void {
  const caps = options.caps ?? DOCUMENT_PAGE_FIT_PROSE_CAPS
  const bucket = getBucket(options.documentId, options.kind)
  if (bucket.samples.has(options.pageNumber)) return
  bucket.samples.set(
    options.pageNumber,
    round1(Math.max(caps.fontMin, Math.min(caps.fontMax, options.fontSize))),
  )
  rebuildShared(bucket, caps)
}

export function clearSharedDocumentPageFits(documentId: string): void {
  for (const kind of ['prose', 'table'] as const) {
    buckets.delete(bucketKey(documentId, kind))
  }
  notify()
}

export function subscribeSharedDocumentPageFit(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
