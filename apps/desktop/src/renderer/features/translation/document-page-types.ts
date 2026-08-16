import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { PdfParserBackend, TranslationLanguage } from '@toolman/shared'
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
  status: DocumentPageStatus
  error?: string
}

export interface DocumentPageRefs {
  pagesRef: MutableRefObject<DocumentPageState[]>
  totalPagesRef: MutableRefObject<number>
  generationRef: MutableRefObject<number>
  inFlightRef: MutableRefObject<Set<number>>
  focusPageRef: MutableRefObject<number | null>
  parseArmedRef: MutableRefObject<boolean>
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
