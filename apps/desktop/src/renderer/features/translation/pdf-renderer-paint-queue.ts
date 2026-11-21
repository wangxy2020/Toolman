/**
 * Single-flight paint queue for renderer pdf.js canvases.
 * Focused pages outrank neighbors; soft-cancel drops stale neighbor work.
 */

type PaintJob = {
  key: string
  filePath: string
  pageNumber: number
  priority: number
  seq: number
  run: (signal: { cancelled: () => boolean }) => Promise<void>
  resolve: () => void
  reject: (error: unknown) => void
  promise: Promise<void>
  cancelled: boolean
}

let seq = 0
let running = false
const items: PaintJob[] = []

function pump(): void {
  if (running) return
  let best = -1
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]!
    if (item.cancelled) continue
    if (
      best < 0 ||
      item.priority > items[best]!.priority ||
      (item.priority === items[best]!.priority && item.seq > items[best]!.seq)
    ) {
      best = index
    }
  }
  if (best < 0) {
    for (let index = items.length - 1; index >= 0; index -= 1) {
      if (items[index]!.cancelled) items.splice(index, 1)
    }
    return
  }
  const [job] = items.splice(best, 1)
  if (!job || job.cancelled) {
    pump()
    return
  }
  running = true
  void job
    .run({ cancelled: () => job.cancelled })
    .then(job.resolve, job.reject)
    .finally(() => {
      running = false
      pump()
    })
}

export function enqueueRendererPdfPaint(options: {
  filePath: string
  pageNumber: number
  /** Higher runs first; focused ≈ 3, neighbor ≈ 1. */
  priority: number
  key: string
  run: (signal: { cancelled: () => boolean }) => Promise<void>
}): Promise<void> {
  const existing = items.find((item) => item.key === options.key && !item.cancelled)
  if (existing) {
    existing.priority = Math.max(existing.priority, options.priority)
    existing.seq = ++seq
    pump()
    return existing.promise
  }

  let resolve!: () => void
  let reject!: (error: unknown) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  items.push({
    key: options.key,
    filePath: options.filePath,
    pageNumber: options.pageNumber,
    priority: options.priority,
    seq: ++seq,
    run: options.run,
    resolve,
    reject,
    promise,
    cancelled: false,
  })
  pump()
  return promise
}

/** Drop pending paints for a file except pages near the landed page. */
export function dropRendererPdfPaints(
  filePath: string,
  keepPage: number,
  retainAround = 1,
): void {
  for (const item of items) {
    if (item.filePath !== filePath) continue
    if (Math.abs(item.pageNumber - keepPage) <= retainAround) continue
    if (item.cancelled) continue
    item.cancelled = true
    item.reject(Object.assign(new Error('PDF_PAINT_DROPPED'), { name: 'PdfPaintDroppedError' }))
  }
}

export function isRendererPdfPaintDropped(error: unknown): boolean {
  return (
    (error instanceof Error && error.name === 'PdfPaintDroppedError') ||
    (error instanceof Error && error.message === 'PDF_PAINT_DROPPED')
  )
}
