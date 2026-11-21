/** Match Preview/Chrome-ish sharpness on Retina without unbounded GPU cost. */
const MAX_DPR = 3
/** Floor for the focused page so 1x displays still look crisp when zoomed in CSS. */
const FOCUSED_MIN_PIXEL_RATIO = 2

/** CSS width → pdf.js viewport scale for left-pane canvas paints. */
export function resolveRendererPdfPaintScale(options: {
  pageWidthPt: number
  cssWidth: number
  focused: boolean
}): number {
  const cssWidth = Math.max(1, options.cssWidth)
  const pageWidth = Math.max(1, options.pageWidthPt)
  const dpr =
    typeof window !== 'undefined'
      ? Math.min(MAX_DPR, Math.max(1, window.devicePixelRatio || 1))
      : 2
  // Focused page: at least 2× backing store (browser PDF level). Neighbors stay lighter.
  const pixelRatio = options.focused
    ? Math.min(MAX_DPR, Math.max(FOCUSED_MIN_PIXEL_RATIO, dpr))
    : Math.min(1.5, dpr)
  return Math.max(0.25, (cssWidth * pixelRatio) / pageWidth)
}
