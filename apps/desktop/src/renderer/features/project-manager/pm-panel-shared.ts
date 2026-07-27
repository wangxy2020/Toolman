/** Shared pure helpers for project-manager table panels (files / cost / resource). */

import type { PmProject } from '@toolman/shared'

/** Label used in print document titles: `CODE · Name` or name-only. */
export function formatPathProjectLabel(project: PmProject): string {
  const code = project.code?.trim() ?? ''
  const name = project.name?.trim() ?? ''
  if (code && name) return `${code} · ${name}`
  return name || code || project.id
}

export type HScrollMetrics = {
  overflowing: boolean
  thumbSize: number
  thumbOffset: number
  scrollWidth: number
  clientWidth: number
  scrollLeft: number
}

/** Compute custom horizontal scrollbar thumb geometry from a scroll element. */
export function computeHScrollMetrics(
  el: HTMLElement,
  trackWidth: number,
  minThumb = 24,
): HScrollMetrics {
  const { scrollWidth, clientWidth, scrollLeft } = el
  const overflowing = scrollWidth > clientWidth + 1
  if (!overflowing || trackWidth <= 0) {
    return {
      overflowing: false,
      thumbSize: 0,
      thumbOffset: 0,
      scrollWidth,
      clientWidth,
      scrollLeft,
    }
  }
  const thumbSize = Math.max(minThumb, (clientWidth / scrollWidth) * trackWidth)
  const maxOffset = Math.max(0, trackWidth - thumbSize)
  const maxScroll = Math.max(1, scrollWidth - clientWidth)
  const thumbOffset = (scrollLeft / maxScroll) * maxOffset
  return {
    overflowing: true,
    thumbSize,
    thumbOffset,
    scrollWidth,
    clientWidth,
    scrollLeft,
  }
}

/** Map a thumb drag position on the track back to element.scrollLeft. */
export function scrollLeftFromThumbOffset(
  metrics: Pick<HScrollMetrics, 'scrollWidth' | 'clientWidth' | 'thumbSize'>,
  trackWidth: number,
  thumbOffset: number,
): number {
  const maxOffset = Math.max(0, trackWidth - metrics.thumbSize)
  const maxScroll = Math.max(0, metrics.scrollWidth - metrics.clientWidth)
  if (maxOffset <= 0 || maxScroll <= 0) return 0
  const ratio = Math.min(1, Math.max(0, thumbOffset / maxOffset))
  return ratio * maxScroll
}
