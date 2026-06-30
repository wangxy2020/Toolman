import { statSync } from 'node:fs'
import { Worker } from 'node:worker_threads'
import { hashFileStream, parseFile, type ParseFileOptions } from '@toolman/knowledge'
import { INGEST_NO_PROGRESS_MS } from './knowledge-ingest-timeouts'
import { resolveMainWorkerScript } from '../lib/resolve-main-worker'

const LARGE_FILE_BYTES = 512 * 1024

export type WorkerParseFileOptions = Pick<ParseFileOptions, 'enhanced' | 'pdfTextQuality' | 'ocr'>

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

export function shouldParseInWorker(filePath: string, ocrEnabled = false): boolean {
  try {
    return statSync(filePath).size >= LARGE_FILE_BYTES || ocrEnabled
  } catch {
    return ocrEnabled
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
      void worker.terminate()
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
      if (message.type === 'ocr-request') {
        touchProgress()
        void (async () => {
          try {
            const text =
              message.kind === 'page'
                ? (await options?.ocr?.recognizePage?.(message.input as never)) ?? ''
                : (
                    await options?.ocr?.recognizeImage?.({
                      buffer: Buffer.from(message.buffer),
                      mimeType: message.mimeType,
                    })
                  ) ?? ''
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
