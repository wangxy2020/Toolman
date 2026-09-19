import {
  assessPdfPageTextQuality,
  isPdfPageTextUsable,
  pickIngestPageBody,
  type PdfPageQualityReason,
} from './pdf-page-quality.js'

export type PdfPageOcrEngine = 'hybrid' | 'glm-ocr'
export type PdfPageParseStatus = 'ok' | 'failed' | 'skipped' | 'deferred'

export interface PdfPageParseRecord {
  pageNumber: number
  nativeTextLength: number
  nativeTextQuality: PdfPageQualityReason
  ocrUsed: boolean
  ocrEngine: PdfPageOcrEngine | null
  ocrTextLength: number
  ocrConfidence: number | null
  finalQuality: PdfPageQualityReason
  parseStatus: PdfPageParseStatus
  processingTimeMs: number
}

export interface PdfIngestParseReport {
  totalPages: number
  processedPages: number
  failedPages: number[]
  skippedPages: number[]
  deferredPages: number[]
  nativePages: number
  ocrPages: number
  hybridPages: number
  glmOcrPages: number
  duplicateOcrPages: number
  warning: string | null
  partial: boolean
  pages: PdfPageParseRecord[]
}

interface PageTrack {
  nativeText: string
  nativeMs: number
  hybridText?: string
  hybridMs: number
  glmText?: string
  glmMs: number
  skipped?: boolean
}

export function formatPdfParseWarning(options: {
  totalPages: number
  processedPages: number
  failedPages: number[]
  skippedPages: number[]
  deferredPages?: number[]
}): string | null {
  const deferredPages = options.deferredPages ?? options.skippedPages
  if (options.failedPages.length === 0 && deferredPages.length === 0) return null
  const preview = options.failedPages.slice(0, 12).join(', ')
  const extra =
    options.failedPages.length > 12 ? `…共 ${options.failedPages.length} 页` : preview ? '' : ''
  const failedPart = options.failedPages.length
    ? `失败页：${preview}${options.failedPages.length > 12 ? extra : ''}`
    : ''
  const deferredPart =
    deferredPages.length > 0
      ? `${failedPart ? '；' : ''}另有 ${deferredPages.length} 页尚未完成 OCR（deferred）`
      : ''
  return `PDF 部分页面解析失败（${options.processedPages}/${options.totalPages} 页可用）。${failedPart}${deferredPart}`
}

export function toPdfParseReportMetadata(report: PdfIngestParseReport): Record<string, unknown> {
  return {
    parse_status: report.partial ? 'partial' : 'ok',
    total_pages: report.totalPages,
    processed_pages: report.processedPages,
    failed_pages: report.failedPages,
    skipped_pages: report.skippedPages,
    deferred_pages: report.deferredPages,
    native_pages: report.nativePages,
    ocr_pages: report.ocrPages,
    hybrid_pages: report.hybridPages,
    glm_ocr_pages: report.glmOcrPages,
    duplicate_ocr_pages: report.duplicateOcrPages,
    warning: report.warning,
    pages: report.pages.map((page) => ({
      page_number: page.pageNumber,
      native_text_length: page.nativeTextLength,
      native_text_quality: page.nativeTextQuality,
      ocr_used: page.ocrUsed,
      ocr_engine: page.ocrEngine,
      ocr_text_length: page.ocrTextLength,
      ocr_confidence: page.ocrConfidence,
      final_quality: page.finalQuality,
      parse_status: page.parseStatus,
      processing_time: page.processingTimeMs,
    })),
  }
}

export function createPdfPageParseTracker(totalPages: number) {
  const pages = new Map<number, PageTrack>()

  const ensure = (pageNumber: number): PageTrack => {
    let track = pages.get(pageNumber)
    if (!track) {
      track = { nativeText: '', nativeMs: 0, hybridMs: 0, glmMs: 0 }
      pages.set(pageNumber, track)
    }
    return track
  }

  return {
    recordNative(pageNumber: number, text: string, processingTimeMs: number) {
      const track = ensure(pageNumber)
      track.nativeText = text
      track.nativeMs += processingTimeMs
    },
    recordHybrid(pageNumber: number, text: string, processingTimeMs: number) {
      const track = ensure(pageNumber)
      track.hybridText = text
      track.hybridMs += processingTimeMs
    },
    recordGlmOcr(pageNumber: number, text: string, processingTimeMs: number) {
      const track = ensure(pageNumber)
      track.glmText = text
      track.glmMs += processingTimeMs
    },
    markSkipped(pageNumbers: number[]) {
      for (const pageNumber of pageNumbers) ensure(pageNumber).skipped = true
    },
    hybridText(pageNumber: number): string | undefined {
      return pages.get(pageNumber)?.hybridText
    },
    finalize(
      keptPages: Map<number, { text?: string; markdown?: string }>,
    ): PdfIngestParseReport {
      const records: PdfPageParseRecord[] = []
      const failedPages: number[] = []
      const skippedPages: number[] = []
      let duplicateOcrPages = 0

      for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
        const track = pages.get(pageNumber) ?? {
          nativeText: '',
          nativeMs: 0,
          hybridMs: 0,
          glmMs: 0,
        }
        const nativeQuality = assessPdfPageTextQuality(track.nativeText)
        const hybridAttempted = track.hybridText !== undefined
        const glmAttempted = track.glmText !== undefined
        const hybridUsable = isPdfPageTextUsable(track.hybridText ?? '')
        const kept = keptPages.get(pageNumber)
        const keptBody = kept ? pickIngestPageBody(kept) : ''
        const finalQuality = assessPdfPageTextQuality(keptBody)

        if (nativeQuality.usable && (hybridAttempted || glmAttempted)) duplicateOcrPages += 1
        else if (hybridUsable && glmAttempted) duplicateOcrPages += 1

        const ocrUsed = hybridAttempted || glmAttempted
        const ocrEngine: PdfPageOcrEngine | null = glmAttempted
          ? 'glm-ocr'
          : hybridAttempted
            ? 'hybrid'
            : null
        const ocrTextLength = glmAttempted
          ? (track.glmText ?? '').length
          : hybridAttempted
            ? (track.hybridText ?? '').length
            : 0

        let parseStatus: PdfPageParseStatus = finalQuality.usable ? 'ok' : 'failed'
        if (!finalQuality.usable && track.skipped) parseStatus = 'deferred'
        if (parseStatus === 'failed') failedPages.push(pageNumber)
        if (parseStatus === 'deferred') skippedPages.push(pageNumber)

        records.push({
          pageNumber,
          nativeTextLength: track.nativeText.length,
          nativeTextQuality: nativeQuality.reason,
          ocrUsed,
          ocrEngine: ocrUsed ? ocrEngine : null,
          ocrTextLength,
          ocrConfidence: null,
          finalQuality: finalQuality.reason,
          parseStatus,
          processingTimeMs: Math.round(track.nativeMs + track.hybridMs + track.glmMs),
        })
      }

      let nativePages = 0
      let hybridPages = 0
      let glmOcrPages = 0
      for (const record of records) {
        if (record.parseStatus !== 'ok') continue
        if (!record.ocrUsed) nativePages += 1
        else if (record.ocrEngine === 'hybrid') hybridPages += 1
        else if (record.ocrEngine === 'glm-ocr') glmOcrPages += 1
      }

      const processedPages = records.filter((record) => record.parseStatus === 'ok').length
      const warning = formatPdfParseWarning({
        totalPages,
        processedPages,
        failedPages,
        skippedPages,
        deferredPages: skippedPages,
      })

      return {
        totalPages,
        processedPages,
        failedPages,
        skippedPages,
        deferredPages: skippedPages,
        nativePages,
        ocrPages: hybridPages + glmOcrPages,
        hybridPages,
        glmOcrPages,
        duplicateOcrPages,
        warning,
        partial: failedPages.length > 0 || skippedPages.length > 0,
        pages: records,
      }
    },
  }
}

export type PdfPageParseTracker = ReturnType<typeof createPdfPageParseTracker>
