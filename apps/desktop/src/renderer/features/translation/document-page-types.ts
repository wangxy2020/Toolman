import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { PdfParserBackend, TranslationLanguage } from '@toolman/shared'
import type { TranslationLayoutBlock } from './translation-layout-blocks'
import type { TranslationDocumentPageSnapshot } from './translation-storage'

export type DocumentPageStatus =
  | 'idle'
  | 'loading-source'
  | 'parsing'
  | 'translating'
  | 'done'
  | 'parsed'
  | 'error'
  | 'empty'

export interface DocumentPageState {
  pageNumber: number
  sourceText: string
  translatedText: string
  parsedMarkdown?: string
  /** Optional block geometry for layout-preserving right pane (P4). */
  layoutBlocks?: TranslationLayoutBlock[]
  status: DocumentPageStatus
  error?: string
}

export interface DocumentPageRefs {
  pagesRef: MutableRefObject<DocumentPageState[]>
  totalPagesRef: MutableRefObject<number>
  generationRef: MutableRefObject<number>
  /** OCR / parse page locks (not translation). */
  inFlightRef: MutableRefObject<Set<number>>
  /** Translate page locks — separate so OCR finally cannot clear them. */
  translateInFlightRef: MutableRefObject<Set<number>>
  /** Generation that owns each in-flight translate page. */
  translatePageGenerationRef: MutableRefObject<Map<number, number>>
  focusPageRef: MutableRefObject<number | null>
  parseArmedRef: MutableRefObject<boolean>
  translationArmedRef: MutableRefObject<boolean>
  odlWarmRunningRef: MutableRefObject<boolean>
  hybridBackfillRunningRef: MutableRefObject<boolean>
  pageSourceLoadRef: MutableRefObject<Map<number, Promise<void>>>
  translateQueueRef: MutableRefObject<number[]>
  translateWorkerRunningRef: MutableRefObject<boolean>
  ocrQueueRef: MutableRefObject<number[]>
  ocrWorkerRunningRef: MutableRefObject<boolean>
  centralOcrPipelineRef: MutableRefObject<boolean>
  ocrExhaustedRef: MutableRefObject<Set<number>>
}

export interface DocumentPageSetters {
  setPages: Dispatch<SetStateAction<DocumentPageState[]>>
  setParseArmed: Dispatch<SetStateAction<boolean>>
  setTranslationArmed: Dispatch<SetStateAction<boolean>>
  setOdlWarmRunning: Dispatch<SetStateAction<boolean>>
  setHybridBackfillRunning: Dispatch<SetStateAction<boolean>>
}

export interface DocumentPageTranslationOptions {
  filePath: string | null
  documentId: string | null
  workspaceId: string | null
  modelId: string | null
  languages: [TranslationLanguage, TranslationLanguage]
  autoDetectSource: boolean
  pdfParserBackend: PdfParserBackend
  enabled: boolean
  savedPageSnapshots?: TranslationDocumentPageSnapshot[]
}
