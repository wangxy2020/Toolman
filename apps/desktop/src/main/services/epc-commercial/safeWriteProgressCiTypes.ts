export type SafeWriteProgressCiErrorCode = 'FILE_LOCKED' | 'INTERNAL_ERROR'

export class SafeWriteProgressCiDataError extends Error {
  readonly code: SafeWriteProgressCiErrorCode

  constructor(message: string, code: SafeWriteProgressCiErrorCode, cause?: unknown) {
    super(message)
    this.name = 'SafeWriteProgressCiDataError'
    this.code = code
    if (cause instanceof Error) {
      this.cause = cause
    }
  }
}

export interface SafeWriteProgressCiRowWrite {
  item: string
  description: string
  unit: string
  estQty?: number
  unitPrice: number
  previous: number
  current: number
  endTotal: number
  proportion?: number
  currentTotalPrice: number
}

export interface SafeWriteProgressCiDataParams {
  outputPath: string
  periodColumnHeader: string
  schDigit?: number
  currency?: string
  batchNumber?: string
  rows: SafeWriteProgressCiRowWrite[]
}

export interface ProgressCiInvoiceLayout {
  headerRow: number
  dataStartRow: number
  itemCol: number
  descriptionCol?: number
  unitCol?: number
  estQtyCol?: number
  qtyCol?: number
  unitPriceCol?: number
  previousCol?: number
  currentCol?: number
  endTotalCol?: number
  proportionCol?: number
  totalCol?: number
}

export interface ProgressCiMergeRect {
  top: number
  left: number
  bottom: number
  right: number
}
