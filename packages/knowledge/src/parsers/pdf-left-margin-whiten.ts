/**
 * ROI pre-processing: whiten the left margin of PDF page images.
 *
 * Punch holes and binder noise typically occupy ~6–8% of page width.
 * Painting that strip white before OCR / vision backends reduces false detections.
 */

export interface LeftMarginWhitenOptions {
  /** Fraction of page width to whiten from the left edge (default 0.07 = 7%). */
  widthRatio?: number
  /** Fill color (default pure white). */
  fillColor?: string
}

/** Minimal 2D context surface used by @napi-rs/canvas and browser Canvas. */
export interface WhitenCanvasContext {
  save(): void
  restore(): void
  fillStyle: string | unknown
  fillRect(x: number, y: number, width: number, height: number): void
}

const DEFAULT_WIDTH_RATIO = 0.07

export function resolveLeftMarginWidth(
  pageWidth: number,
  options?: LeftMarginWhitenOptions,
): number {
  const ratio = options?.widthRatio ?? DEFAULT_WIDTH_RATIO
  return Math.max(1, Math.round(pageWidth * ratio))
}

/**
 * Paint the left margin strip white on a 2D canvas context.
 */
export function whitenCanvasLeftMargin(
  context: WhitenCanvasContext,
  width: number,
  height: number,
  options?: LeftMarginWhitenOptions,
): void {
  const marginWidth = resolveLeftMarginWidth(width, options)
  context.save()
  context.fillStyle = options?.fillColor ?? '#ffffff'
  context.fillRect(0, 0, marginWidth, height)
  context.restore()
}

/**
 * Whiten the left margin on raw RGBA image data (in-place).
 */
export function whitenImageDataLeftMargin(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options?: LeftMarginWhitenOptions,
): void {
  const marginWidth = resolveLeftMarginWidth(width, options)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < marginWidth; x += 1) {
      const index = (y * width + x) * 4
      data[index] = 255
      data[index + 1] = 255
      data[index + 2] = 255
      data[index + 3] = 255
    }
  }
}

/**
 * Apply left-margin whitening to a rendered page canvas (used by OCR render path).
 */
export function whitenRenderedPageCanvas(
  canvas: { width: number; height: number; getContext: (id: '2d') => WhitenCanvasContext | null },
  options?: LeftMarginWhitenOptions,
): void {
  const context = canvas.getContext('2d')
  if (!context) return
  whitenCanvasLeftMargin(context, canvas.width, canvas.height, options)
}
