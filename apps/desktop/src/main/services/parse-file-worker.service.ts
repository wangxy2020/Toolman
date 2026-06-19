import { statSync } from 'node:fs'
import { extname, join } from 'node:path'
import { Worker } from 'node:worker_threads'
import type { ParseFileOptions } from '@toolman/knowledge'

const LARGE_FILE_BYTES = 512 * 1024

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
): Promise<ParsedFileWorkerResult> {
  return new Promise((resolve, reject) => {
    const workerPath = join(__dirname, 'workers/parse-file.worker.js')
    const worker = new Worker(workerPath)

    const cleanup = () => {
      void worker.terminate()
    }

    worker.once('message', (message: { ok: boolean } & ParsedFileWorkerResult & { error?: string }) => {
      cleanup()
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

    worker.once('error', (error) => {
      cleanup()
      reject(error)
    })

    worker.postMessage({
      filePath,
      enhanced: options?.enhanced,
    })
  })
}
