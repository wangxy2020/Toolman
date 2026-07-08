/** Which PDF extraction engine Toolman uses. */
export type PdfParserBackend = 'builtin' | 'opendataloader'

/** Shared consumer profiles for document parsing. */
export type DocumentParseProfile = 'knowledge' | 'chat' | 'translation' | 'metadata'

export interface DocumentPageText {
  pageNumber: number
  text: string
  markdown?: string
  /** Set when OCR/ODL collapse left mostly blank or noise after salvage. */
  isBlankOrNoise?: boolean
  /** Anomaly reasons from the data interceptor (if any). */
  anomalyReasons?: string[]
}

export interface DocumentParseResult {
  backend: PdfParserBackend
  totalPages: number
  plainText: string
  markdown: string
  pages: DocumentPageText[]
  /** PDF page size in points (page 1). */
  pageWidth?: number
  pageHeight?: number
  jsonPath?: string
}

/** Hybrid OCR backend options passed to @opendataloader/pdf convert(). */
export interface OdlHybridConfig {
  backend: 'docling-fast' | 'hancom-ai'
  url?: string
  mode?: 'auto' | 'full'
  hancomAiOcrStrategy?: 'off' | 'auto' | 'force'
  /** Per-request timeout in ms (mapped to hybridTimeout). */
  timeoutMs?: number
}

/** Extra convert knobs for anomaly-retry passes (not all are in @opendataloader/pdf typings). */
export interface OdlConvertOverrides {
  /**
   * Detection confidence threshold for hybrid/OCR backends.
   * Passed as `--det-threshold` when ≥ 0.8; ignored by native Java-only pipeline.
   */
  detThreshold?: number
  /** Keep content-safety filters enabled on retry (recommended). */
  enableContentSafety?: boolean
  /** Left-margin ROI whitening ratio applied before retry (0.06–0.08 typical). */
  leftMarginWhitenRatio?: number
}

export interface DocumentParseRequest {
  filePath: string
  profile: DocumentParseProfile
  /** Inclusive 1-based page range. Omit for full document. */
  pageRange?: { start: number; end: number }
  password?: string
  /** Override output directory (otherwise uses a temp dir). */
  outputDir?: string
  /** Optional convert overrides (anomaly retry, ROI preprocessing hints). */
  convertOverrides?: OdlConvertOverrides
  /** Enable hybrid OCR backend (requires running opendataloader-pdf-hybrid server). */
  odlHybrid?: OdlHybridConfig
}

export interface JavaRuntimeStatus {
  available: boolean
  version?: string
  error?: string
}

export interface OpenDataLoaderAvailability {
  npmPackageInstalled: true
  java: JavaRuntimeStatus
  ready: boolean
}
