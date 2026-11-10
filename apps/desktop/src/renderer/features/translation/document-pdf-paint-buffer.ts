/** Detached / Offscreen paint buffer so pdf.js font metrics do not thrash in-DOM styles. */

export type PdfPaintBuffer = {
  width: number
  height: number
  canvas: HTMLCanvasElement | OffscreenCanvas
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
  blitTo: (target: HTMLCanvasElement) => void
  toImageBitmap: () => Promise<ImageBitmap | null>
  dispose: () => void
}

function supportsOffscreenCanvas(): boolean {
  return typeof OffscreenCanvas === 'function'
}

export function createPdfPaintBuffer(width: number, height: number): PdfPaintBuffer {
  const w = Math.max(1, Math.floor(width))
  const h = Math.max(1, Math.floor(height))

  if (supportsOffscreenCanvas()) {
    const canvas = new OffscreenCanvas(w, h)
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) throw new Error('OffscreenCanvas is unavailable')
    return {
      width: w,
      height: h,
      canvas,
      context,
      blitTo(target) {
        target.width = w
        target.height = h
        const dest = target.getContext('2d', { alpha: false })
        if (!dest) throw new Error('Canvas is unavailable')
        dest.drawImage(canvas, 0, 0)
      },
      async toImageBitmap() {
        // Prefer a copy so we can blit the same buffer to the visible canvas.
        if (typeof createImageBitmap !== 'function') return null
        try {
          return await createImageBitmap(canvas)
        } catch {
          return null
        }
      },
      dispose() {
        // OffscreenCanvas is GC'd after the paint job.
      },
    }
  }

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) throw new Error('Canvas is unavailable')
  return {
    width: w,
    height: h,
    canvas,
    context,
    blitTo(target) {
      target.width = w
      target.height = h
      const dest = target.getContext('2d', { alpha: false })
      if (!dest) throw new Error('Canvas is unavailable')
      dest.drawImage(canvas, 0, 0)
    },
    async toImageBitmap() {
      if (typeof createImageBitmap !== 'function') return null
      try {
        return await createImageBitmap(canvas)
      } catch {
        return null
      }
    },
    dispose() {
      canvas.width = 0
      canvas.height = 0
    },
  }
}
