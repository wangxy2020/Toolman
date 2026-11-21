/**
 * Renderer-side pdf.js document cache for the translation left pane.
 * Loads each PDF once via binary IPC and keeps the document warm across page flips.
 * Main-process parse/OCR keeps its own Node pdf.js — no shared contention.
 */
import './pdf-map-upsert-polyfill'
import {
  FileReadBinaryOutputSchema,
  IpcChannel,
} from '@toolman/shared'
// Electron 39's V8 lacks Map/WeakMap.getOrInsertComputed; the modern pdf.js
// build crashes with "__privateGet(...).getOrInsertComputed is not a function".
// Legacy build ships the TC39 upsert polyfills (same path as @toolman/knowledge).
import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
} from 'pdfjs-dist/legacy/build/pdf.mjs'
import pdfWorkerSrc from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'

let workerConfigured = false

function ensurePdfjsWorker(): void {
  if (workerConfigured) return
  GlobalWorkerOptions.workerSrc = pdfWorkerSrc
  workerConfigured = true
}

/**
 * Dev: Vite middleware at /pdfjs/*.
 * Prod: privileged tm-pdfjs:// protocol (file:// cannot fetch sibling assets in the worker).
 */
function pdfjsAssetUrl(subdir: string): string {
  const trimmed = subdir.replace(/^\/+|\/+$/g, '')
  if (import.meta.env.DEV) {
    return `/pdfjs/${trimmed}/`
  }
  return `tm-pdfjs://local/${trimmed}/`
}

function toUint8Array(value: Uint8Array | ArrayBuffer): Uint8Array {
  if (value instanceof Uint8Array) {
    // Copy so pdf.js owns stable memory after IPC transfer/detach.
    const copy = new Uint8Array(value.byteLength)
    copy.set(value)
    return copy
  }
  return new Uint8Array(value)
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

async function readPdfBytes(filePath: string): Promise<Uint8Array> {
  const result = await window.api.invoke(IpcChannel.FileReadBinary, {
    path: filePath,
    maxBytes: 80 * 1024 * 1024,
  })
  if (!result.ok) {
    throw new Error(result.error.message || 'Failed to read PDF')
  }
  const payload = FileReadBinaryOutputSchema.parse(result.data)
  if (payload.bytes && payload.bytes.byteLength > 0) {
    return toUint8Array(payload.bytes)
  }
  if (payload.base64) return base64ToUint8Array(payload.base64)
  throw new Error('PDF payload missing bytes')
}

type CacheEntry = {
  promise: Promise<PDFDocumentProxy>
  doc: PDFDocumentProxy | null
  loadingTask: PDFDocumentLoadingTask | null
}

const documentCache = new Map<string, CacheEntry>()

export async function getRendererPdfDocument(filePath: string): Promise<PDFDocumentProxy> {
  const existing = documentCache.get(filePath)
  if (existing) {
    if (existing.doc) return existing.doc
    return existing.promise
  }

  ensurePdfjsWorker()
  const entry: CacheEntry = {
    promise: Promise.resolve(null as unknown as PDFDocumentProxy),
    doc: null,
    loadingTask: null,
  }

  entry.promise = (async () => {
    const data = await readPdfBytes(filePath)
    const loadingTask = getDocument({
      data,
      verbosity: 0,
      useSystemFonts: true,
      stopAtErrors: false,
      cMapUrl: pdfjsAssetUrl('cmaps'),
      cMapPacked: true,
      standardFontDataUrl: pdfjsAssetUrl('standard_fonts'),
      wasmUrl: pdfjsAssetUrl('wasm'),
      iccUrl: pdfjsAssetUrl('iccs'),
    })
    entry.loadingTask = loadingTask
    const doc = await loadingTask.promise
    entry.doc = doc
    return doc
  })()

  documentCache.set(filePath, entry)
  try {
    return await entry.promise
  } catch (error) {
    documentCache.delete(filePath)
    throw error
  }
}

/** Warm the document as soon as the workspace knows the path. */
export function prefetchRendererPdfDocument(filePath: string): void {
  void getRendererPdfDocument(filePath).catch(() => {
    // Prefetch is best-effort; page paint will surface errors.
  })
}

export async function releaseRendererPdfDocument(filePath: string): Promise<void> {
  const entry = documentCache.get(filePath)
  if (!entry) return
  documentCache.delete(filePath)
  try {
    await entry.loadingTask?.destroy()
  } catch {
    try {
      await entry.doc?.cleanup()
    } catch {
      // ignore
    }
  }
}
