import { statSync } from 'node:fs'
import { Worker } from 'node:worker_threads'
import { renderPdfPagePreview } from '@toolman/knowledge'
import { resolveMainWorkerScript } from '../lib/resolve-main-worker'
import {
  getDurablePdfPreviewJpeg,
  setDurablePdfPreviewJpeg,
} from './pdf-preview-durable-cache'
import type {
  PdfPreviewWorkerRequest,
  PdfPreviewWorkerResponse,
} from '../workers/pdf-preview.worker'

export type PdfPreviewRenderResult = {
  totalPages: number
  pageNumber: number
  base64: string
  mimeType: 'image/png' | 'image/jpeg'
  width: number
  height: number
}

type PendingJob = {
  resolve: (value: PdfPreviewRenderResult) => void
  reject: (error: Error) => void
  filePath: string
  pageNumber: number
  priority: 'visible' | 'prefetch'
  targetWidth: number
  /** Caller was dropped; still keep the finished JPEG in the durable cache. */
  dropped?: boolean
}

let worker: Worker | null = null
let workerFailed = false
let nextRequestId = 1
let lastFastPaintPage = 0
const pending = new Map<number, PendingJob>()

function rejectAllPending(error: Error) {
  for (const [, job] of pending) job.reject(error)
  pending.clear()
}

function dropError(): Error {
  const error = new Error('PREVIEW_RENDER_DROPPED')
  error.name = 'PreviewRenderDroppedError'
  return error
}

function ensureWorker(): Worker | null {
  if (workerFailed) return null
  if (worker) return worker

  const workerPath = resolveMainWorkerScript('pdf-preview.worker.js')
  if (!workerPath) {
    workerFailed = true
    return null
  }

  try {
    worker = new Worker(workerPath)
  } catch (error) {
    workerFailed = true
    worker = null
    throw error instanceof Error ? error : new Error(String(error))
  }

  worker.on('message', (response: PdfPreviewWorkerResponse) => {
    if (!response || response.type !== 'render-result') return
    const job = pending.get(response.id)
    if (!job) return
    pending.delete(response.id)
    if (response.ok) {
      // Always cache finished JPEGs — even when the caller was dropped — so
      // flip-back / prefetch reuse does not re-raster a scan page.
      try {
        const mtimeMs = statSync(job.filePath).mtimeMs
        setDurablePdfPreviewJpeg(job.filePath, mtimeMs, response.pageNumber, job.targetWidth, {
          jpeg: Buffer.from(response.base64, 'base64'),
          mimeType: 'image/jpeg',
          width: response.width,
          height: response.height,
          totalPages: response.totalPages,
        })
      } catch {
        // Durable cache is best-effort.
      }
      if (job.dropped) return
      job.resolve({
        totalPages: response.totalPages,
        pageNumber: response.pageNumber,
        base64: response.base64,
        mimeType: response.mimeType,
        width: response.width,
        height: response.height,
      })
      return
    }
    if (job.dropped) return
    const error = new Error(response.error)
    if (response.aborted) error.name = 'PreviewRenderDroppedError'
    job.reject(error)
  })

  worker.on('error', (error) => {
    rejectAllPending(error instanceof Error ? error : new Error(String(error)))
    worker = null
    workerFailed = false
  })

  worker.on('exit', () => {
    worker = null
  })

  return worker
}

function dropStaleJobs(filePath: string, pageNumber: number) {
  for (const [, job] of pending) {
    if (job.filePath !== filePath) continue
    if (job.pageNumber === pageNumber) continue
    if (job.dropped) continue
    // Keep the pending entry so a late worker result still fills the durable cache.
    job.dropped = true
    job.reject(dropError())
  }
}

/** Soft-cancel in the worker — never terminate on normal page flips. */
function requestSoftCancel(filePath: string, keepPage: number) {
  dropStaleJobs(filePath, keepPage)
  const active = worker
  if (!active) return
  try {
    active.postMessage({ type: 'cancel', filePath, keepPage })
  } catch {
    // Worker may be mid-exit; next ensureWorker recreates if needed.
  }
}

async function renderInProcess(
  filePath: string,
  pageNumber: number,
  targetWidth: number,
  priority?: 'visible' | 'prefetch',
): Promise<PdfPreviewRenderResult> {
  const rendered = await renderPdfPagePreview(filePath, pageNumber, targetWidth, { priority })
  try {
    const mtimeMs = statSync(filePath).mtimeMs
    setDurablePdfPreviewJpeg(filePath, mtimeMs, rendered.pageNumber, targetWidth, {
      jpeg: rendered.png,
      mimeType: 'image/jpeg',
      width: rendered.width,
      height: rendered.height,
      totalPages: rendered.totalPages,
    })
  } catch {
    // ignore
  }
  return {
    totalPages: rendered.totalPages,
    pageNumber: rendered.pageNumber,
    base64: rendered.png.toString('base64'),
    mimeType: rendered.mimeType,
    width: rendered.width,
    height: rendered.height,
  }
}

/** Render one PDF preview page; prefers a long-lived worker thread. */
export async function renderPdfPreviewPage(options: {
  filePath: string
  pageNumber: number
  targetWidth: number
  priority?: 'visible' | 'prefetch'
}): Promise<PdfPreviewRenderResult> {
  const priority = options.priority ?? 'visible'
  const isFastPaint = priority === 'visible' && options.targetWidth < 900

  // Soft-cancel before any cache short-circuit so a durable hit on the landed
  // page still frees the queue from middle-page scan rasters.
  if (isFastPaint) {
    if (lastFastPaintPage > 0 && lastFastPaintPage !== options.pageNumber) {
      requestSoftCancel(options.filePath, options.pageNumber)
    }
    lastFastPaintPage = options.pageNumber
  } else if (priority === 'visible') {
    // Sharp upgrades should also free the worker from other pages' scan rasters.
    requestSoftCancel(options.filePath, options.pageNumber)
  }

  // Durable main-process hit — skip worker entirely (flip-back / prefetch reuse).
  try {
    const mtimeMs = statSync(options.filePath).mtimeMs
    const durable = getDurablePdfPreviewJpeg(
      options.filePath,
      mtimeMs,
      options.pageNumber,
      options.targetWidth,
    )
    if (durable) {
      return {
        totalPages: durable.totalPages,
        pageNumber: options.pageNumber,
        base64: durable.jpeg.toString('base64'),
        mimeType: durable.mimeType,
        width: durable.width,
        height: durable.height,
      }
    }
  } catch {
    // continue to worker
  }

  let activeWorker: Worker | null = null
  try {
    activeWorker = ensureWorker()
  } catch {
    activeWorker = null
  }

  if (!activeWorker) {
    return renderInProcess(options.filePath, options.pageNumber, options.targetWidth, priority)
  }

  const id = nextRequestId
  nextRequestId += 1

  return new Promise<PdfPreviewRenderResult>((resolve, reject) => {
    pending.set(id, {
      resolve,
      reject,
      filePath: options.filePath,
      pageNumber: options.pageNumber,
      priority,
      targetWidth: options.targetWidth,
    })
    const message: PdfPreviewWorkerRequest = {
      type: 'render',
      id,
      filePath: options.filePath,
      pageNumber: options.pageNumber,
      targetWidth: options.targetWidth,
      priority,
    }
    activeWorker.postMessage(message)
  })
}
