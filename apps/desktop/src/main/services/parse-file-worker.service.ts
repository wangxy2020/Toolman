import { statSync } from 'node:fs'
import { extname, join } from 'node:path'
import { Worker } from 'node:worker_threads'
import type { ParseFileOptions } from '@toolman/knowledge'

const LARGE_FILE_BYTES = 512 * 1024
const WORKER_PARSE_BASE_TIMEOUT_MS = 20 * 60 * 1000
const WORKER_PARSE_MS_PER_MB = 90 * 1000
const WORKER_PARSE_MAX_TIMEOUT_MS = 2 * 60 * 60 * 1000

export type WorkerParseFileOptions = Pick<ParseFileOptions, 'enhanced' | 'pdfTextQuality'>

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

const OCR_PARSE_EXTENSIONS = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'])

export interface ParsedFileWorkerResult {
  contentHash: string
  title: string
  plainText: string
  mimeType: string
  kind: string
}

export function shouldParseInWorker(filePath: string, ocrEnabled = false): boolean {
  if (ocrEnabled && OCR_PARSE_EXTENSIONS.has(extname(filePath).toLowerCase())) {
    return false
  }

  try {
    return statSync(filePath).size >= LARGE_FILE_BYTES
  } catch {
    return false
  }
}

export function parseFileInWorker(
  filePath: string,
  options?: ParseFileOptions,
  timeoutMs?: number,
): Promise<ParsedFileWorkerResult> {
  const workerParseOptions: WorkerParseFileOptions = {
    enhanced: options?.enhanced,
    pdfTextQuality: options?.pdfTextQuality,
  }
  const effectiveTimeoutMs = timeoutMs ?? resolveWorkerParseTimeoutMs(filePath)

  return new Promise((resolve, reject) => {
    const workerPath = join(__dirname, 'workers/parse-file.worker.js')
    const worker = new Worker(workerPath)
    let settled = false

    const cleanup = () => {
      void worker.terminate()
    }

    const finish = (handler: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutId)
      cleanup()
      handler()
    }

    const timeoutId = setTimeout(() => {
      finish(() => {
        reject(new Error('文件解析超时，请检查文件是否损坏或过大'))
      })
    }, effectiveTimeoutMs)

    worker.once('message', (message: { ok: boolean } & ParsedFileWorkerResult & { error?: string }) => {
      finish(() => {
        if (message.ok) {
          resolve({
            contentHash: message.contentHash,
            title: message.title,
            plainText: message.plainText,
            mimeType: message.mimeType,
            kind: message.kind,
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

    worker.postMessage({
      filePath,
      parseOptions: workerParseOptions,
    })
  })
}
