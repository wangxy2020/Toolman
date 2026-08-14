import { fireAndForget } from '../lib/fire-and-forget'
import { statSync } from 'node:fs'
import { Worker } from 'node:worker_threads'
import {
  detectFileKind,
  hashFileStream,
  parseFile,
  type ParseFileOptions,
} from '@toolman/knowledge'
import { INGEST_NO_PROGRESS_MS } from './knowledge-ingest-timeouts'
import { resolveMainWorkerScript } from '../lib/resolve-main-worker'

const LARGE_FILE_BYTES = 512 * 1024

const WORKER_PARSE_BASE_TIMEOUT_MS = 20 * 60 * 1000
const WORKER_PARSE_MS_PER_MB = 90 * 1000
const WORKER_PARSE_MAX_TIMEOUT_MS = 2 * 60 * 60 * 1000

function resolveWorkerParseTimeoutMs(filePath: string): number {
  try {
    const fileMb = statSync(filePath).size / (1024 * 1024)
    return Math.min(
      WORKER_PARSE_BASE_TIMEOUT_MS + Math.ceil(fileMb) * WORKER_PARSE_MS_PER_MB,
      WORKER_PARSE_MAX_TIMEOUT_MS,
    )
  } catch {
    return WORKER_PARSE_BASE_TIMEOUT_MS
  }
}

export interface ParsedFileWorkerResult {
  contentHash: string
  title: string
  plainText: string
  mimeType: string
  kind: string
}

/** OCR only applies to PDF / images — do not route markdown/text through the OCR worker. */
function fileNeedsOcrWorker(filePath: string): boolean {
  const kind = detectFileKind(filePath)
  return kind === 'pdf' || kind === 'image'
}

export function shouldParseInWorker(filePath: string, ocrEnabled = false): boolean {
  try {
    if (statSync(filePath).size >= LARGE_FILE_BYTES) return true
  } catch {
    // Missing file: fall through to OCR-kind check only.
  }
  return ocrEnabled && fileNeedsOcrWorker(filePath)
}

/** Worker structured-clone turns Buffer into Uint8Array — restore a real Buffer for OCR. */
function normalizeWorkerOcrPageInput(input: unknown): {
  png: Buffer
  mimeType?: string
  pageNumber: number
  totalPages: number
} {
  const record = (input && typeof input === 'object' ? input : {}) as {
    png?: Buffer | Uint8Array | ArrayBuffer | { type?: string; data?: number[] }
    mimeType?: string
    pageNumber?: number
    totalPages?: number
  }

  const pngValue = record.png
  let png: Buffer
  if (Buffer.isBuffer(pngValue)) {
    png = pngValue
  } else if (pngValue instanceof ArrayBuffer) {
    png = Buffer.from(pngValue)
  } else if (ArrayBuffer.isView(pngValue)) {
    png = Buffer.from(pngValue.buffer, pngValue.byteOffset, pngValue.byteLength)
  } else if (pngValue && typeof pngValue === 'object' && Array.isArray(pngValue.data)) {
    png = Buffer.from(pngValue.data)
  } else {
    throw new Error('OCR page image payload is missing or invalid')
  }

  return {
    png,
    mimeType: record.mimeType,
    pageNumber: record.pageNumber ?? 1,
    totalPages: record.totalPages ?? 1,
  }
}

type WorkerOutboundMessage =
  | {
      type: 'ocr-request'
      requestId: number
      kind: 'page'
      input: unknown
    }
  | {
      type: 'ocr-request'
      requestId: number
      kind: 'image'
      mimeType: string
      buffer: ArrayBuffer
    }
  | {
      type: 'ocr-progress'
      currentPage: number
      totalPages: number
      inProgress?: boolean
    }
  | {
      type: 'parse-result'
      ok: boolean
      contentHash?: string
      title?: string
      plainText?: string
      mimeType?: string
      kind?: string
      error?: string
    }

export function parseFileInWorker(
  filePath: string,
  options?: ParseFileOptions,
  timeoutMs?: number,
): Promise<ParsedFileWorkerResult> {
  const workerPath = resolveMainWorkerScript('parse-file.worker.js')
  if (!workerPath) {
    return parseFileOnMainThread(filePath, options)
  }

  const effectiveTimeoutMs = timeoutMs ?? resolveWorkerParseTimeoutMs(filePath)

  return new Promise((resolve, reject) => {
    const workerPath = resolveMainWorkerScript('parse-file.worker.js')
    if (!workerPath) {
      reject(new Error('parse-file worker bundle is missing'))
      return
    }
    const worker = new Worker(workerPath)
    let settled = false
    let lastProgressAt = Date.now()

    const touchProgress = () => {
      lastProgressAt = Date.now()
    }

    const cleanup = () => {
      clearTimeout(timeoutId)
      clearInterval(noProgressTimer)
      fireAndForget('parse-file-worker', worker.terminate())
    }

    const finish = (handler: () => void) => {
      if (settled) return
      settled = true
      cleanup()
      handler()
    }

    const timeoutId = setTimeout(() => {
      finish(() => {
        reject(new Error('文件解析超时，请检查文件是否损坏或过大'))
      })
    }, effectiveTimeoutMs)

    const noProgressTimer = setInterval(() => {
      if (Date.now() - lastProgressAt < INGEST_NO_PROGRESS_MS) return
      finish(() => {
        reject(new Error('文件解析长时间无进展，已自动取消'))
      })
    }, 30_000)

    worker.on('message', (message: WorkerOutboundMessage) => {
      if (message.type === 'ocr-progress') {
        touchProgress()
        options?.onOcrProgress?.(message.currentPage, message.totalPages, message.inProgress)
        return
      }

      if (message.type === 'ocr-request') {
        touchProgress()
        void (async () => {
          try {
            let text = ''
            if (message.kind === 'page') {
              const input = normalizeWorkerOcrPageInput(message.input)
              // Backup progress update in case worker onProgress was missed.
              options?.onOcrProgress?.(input.pageNumber - 1, input.totalPages, true)
              text = (await options?.ocr?.recognizePage?.(input)) ?? ''
              options?.onOcrProgress?.(input.pageNumber, input.totalPages, false)
            } else {
              text =
                (await options?.ocr?.recognizeImage?.({
                  buffer: Buffer.from(message.buffer),
                  mimeType: message.mimeType,
                })) ?? ''
            }
            if (settled) {
              worker.postMessage({
                type: 'ocr-response',
                requestId: message.requestId,
                text: '',
              })
              return
            }
            worker.postMessage({
              type: 'ocr-response',
              requestId: message.requestId,
              text,
            })
            touchProgress()
          } catch (error) {
            finish(() => {
              reject(error instanceof Error ? error : new Error(String(error)))
            })
          }
        })()
        return
      }

      if (message.type !== 'parse-result') return

      finish(() => {
        if (message.ok) {
          resolve({
            contentHash: message.contentHash!,
            title: message.title!,
            plainText: message.plainText!,
            mimeType: message.mimeType!,
            kind: message.kind!,
          })
          return
        }
        reject(new Error(message.error ?? '文件解析失败'))
      })
    })

    worker.once('error', (error) => {
      finish(() => {
        reject(error)
      })
    })

    touchProgress()
    worker.postMessage({
      type: 'parse',
      filePath,
      parseOptions: {
        enhanced: options?.enhanced,
        pdfTextQuality: options?.pdfTextQuality,
        ocr: options?.ocr?.enabled
          ? {
              enabled: true,
              maxPdfPages: options.ocr.maxPdfPages,
            }
          : undefined,
      },
    })
  })
}

async function parseFileOnMainThread(
  filePath: string,
  options?: ParseFileOptions,
): Promise<ParsedFileWorkerResult> {
  const contentHash = await hashFileStream(filePath)
  const parsed = await parseFile(filePath, options)
  return {
    contentHash,
    title: parsed.title,
    plainText: parsed.plainText,
    mimeType: parsed.mimeType,
    kind: parsed.kind,
  }
}
