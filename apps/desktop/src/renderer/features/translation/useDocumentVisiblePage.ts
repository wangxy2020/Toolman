import { useEffect, useState, type RefObject } from 'react'

/** Track which document page row is most visible in the scroll container. */
export function useDocumentVisiblePage(
  scrollRootRef: RefObject<HTMLElement | null>,
  enabled: boolean,
) {
  const [currentPage, setCurrentPage] = useState(1)

  useEffect(() => {
    if (!enabled) {
      setCurrentPage(1)
      return
    }

    const root = scrollRootRef.current
    if (!root) return

    const visible = new Map<number, number>()

    const pickBestPage = () => {
      if (visible.size === 0) return
      let bestPage = 1
      let bestRatio = -1
      for (const [pageNumber, ratio] of visible) {
        if (ratio > bestRatio) {
          bestRatio = ratio
          bestPage = pageNumber
        }
      }
      setCurrentPage(bestPage)
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const pageNumber = Number((entry.target as HTMLElement).dataset.pageNumber)
          if (!Number.isFinite(pageNumber) || pageNumber < 1) continue
          if (entry.isIntersecting) {
            visible.set(pageNumber, entry.intersectionRatio)
          } else {
            visible.delete(pageNumber)
          }
        }
        pickBestPage()
      },
      { root, threshold: [0, 0.15, 0.35, 0.55, 0.75, 1] },
    )

    const observeRows = () => {
      observer.disconnect()
      visible.clear()
      root.querySelectorAll<HTMLElement>('[data-page-number]').forEach((row) => observer.observe(row))
      pickBestPage()
    }

    observeRows()
    const mutationObserver = new MutationObserver(observeRows)
    mutationObserver.observe(root, { childList: true, subtree: true })

    return () => {
      observer.disconnect()
      mutationObserver.disconnect()
    }
  }, [enabled, scrollRootRef])

  return currentPage
}
