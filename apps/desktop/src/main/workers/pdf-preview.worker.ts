/**
 * Toolman PDF preview worker
 * Copyright (C) 2024–2026 Toolman Contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Source: https://github.com/wangxy2020/Toolman
 *
 * Long-lived worker: soft-cancel in-flight renders on page flip without
 * destroying the pdf.js document cache (critical for image/scan PDFs).
 */
import { parentPort } from 'node:worker_threads'
import { cancelPdfPreviewRenders, renderPdfPagePreview } from '@toolman/knowledge'
import { toErrorMessage } from '@toolman/shared'

export type PdfPreviewWorkerRequest =
  | {
      type: 'render'
      id: number
      filePath: string
      pageNumber: number
      targetWidth: number
      priority?: 'visible' | 'prefetch'
    }
  | {
      type: 'cancel'
      filePath: string
      keepPage: number
    }

export type PdfPreviewWorkerResponse =
  | {
      type: 'render-result'
      id: number
      ok: true
      totalPages: number
      pageNumber: number
      base64: string
      mimeType: 'image/png' | 'image/jpeg'
      width: number
      height: number
    }
  | {
      type: 'render-result'
      id: number
      ok: false
      error: string
      aborted?: boolean
    }

if (!parentPort) {
  throw new Error('pdf-preview.worker must run as a worker thread')
}

parentPort.on('message', (message: PdfPreviewWorkerRequest) => {
  if (!message || typeof message !== 'object') return
  const port = parentPort
  if (!port) return

  if (message.type === 'cancel') {
    cancelPdfPreviewRenders(message.filePath, message.keepPage)
    return
  }

  if (message.type !== 'render') return

  void (async () => {
    try {
      const rendered = await renderPdfPagePreview(
        message.filePath,
        message.pageNumber,
        message.targetWidth,
        { priority: message.priority },
      )
      const response: PdfPreviewWorkerResponse = {
        type: 'render-result',
        id: message.id,
        ok: true,
        totalPages: rendered.totalPages,
        pageNumber: rendered.pageNumber,
        base64: rendered.png.toString('base64'),
        mimeType: rendered.mimeType,
        width: rendered.width,
        height: rendered.height,
      }
      port.postMessage(response)
    } catch (error) {
      const aborted =
        error instanceof Error &&
        (error.message === 'PREVIEW_RENDER_DROPPED' || error.name === 'PreviewRenderDroppedError')
      const response: PdfPreviewWorkerResponse = {
        type: 'render-result',
        id: message.id,
        ok: false,
        error: toErrorMessage(error, 'PDF preview render failed'),
        aborted,
      }
      port.postMessage(response)
    }
  })()
})
