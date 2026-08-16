import { memo, useEffect, useRef, useState, type RefObject } from 'react'
import { DocumentPageCard } from './TranslationDocumentPageCard'
import { PdfPageImage, SourceTextPage } from './TranslationDocumentPagePdf'
import type { PageDisplayBox } from './translation-document-workspace-types'
import type { DocumentPageState } from './useDocumentPageTranslation'

interface Props {
  page: DocumentPageState
  totalPages: number
  filePath: string
  isPdf: boolean
  pageBox: PageDisplayBox
  /** PDF page height / width; reserves consistent preview height before render. */
  pageAspect: number | null
  hasModel: boolean
  parseArmed: boolean
  translationArmed: boolean
  scrollRootRef: RefObject<HTMLElement | null>
  onEnsurePage: (pageNumber: number) => void
}

export const TranslationDocumentPageRow = memo(function TranslationDocumentPageRow({
  page,
  totalPages,
  filePath,
  isPdf,
  pageBox,
  pageAspect,
  hasModel,
  parseArmed,
  translationArmed,
  scrollRootRef,
  onEnsurePage,
}: Props) {
  const rowRef = useRef<HTMLDivElement | null>(null)
  // Only the first page starts active; others wait for intersection.
  const [active, setActive] = useState(page.pageNumber === 1)

  useEffect(() => {
    setActive(page.pageNumber === 1)
  }, [filePath, page.pageNumber])

  useEffect(() => {
    const root = scrollRootRef.current
    const row = rowRef.current
    if (!root || !row) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(true)
            if (translationArmed || parseArmed) {
              onEnsurePage(page.pageNumber)
            }
          } else {
            // Release render priority for off-screen pages (images stay cached).
            setActive(false)
          }
        }
      },
      { root, rootMargin: '120px 0px', threshold: 0.01 },
    )
    observer.observe(row)
    return () => observer.disconnect()
  }, [filePath, onEnsurePage, page.pageNumber, parseArmed, scrollRootRef, translationArmed])

  return (
    <div ref={rowRef} className="tm-translation-doc-row" data-page-number={page.pageNumber}>
      <section className="tm-translation-doc-row-pane tm-translation-doc-row-pane--source">
        <div className="tm-translation-doc-row-frame tm-translation-doc-row-frame--source">
          {isPdf ? (
            <PdfPageImage
              filePath={filePath}
              pageNumber={page.pageNumber}
              pageBox={pageBox}
              pageAspect={pageAspect}
              active={active}
            />
          ) : (
            <SourceTextPage page={page} />
          )}
        </div>
      </section>

      <div className="tm-translation-doc-row-divider" aria-hidden="true" />

      <section className="tm-translation-doc-row-pane tm-translation-doc-row-pane--target">
        <div className="tm-translation-doc-row-frame tm-translation-doc-row-frame--target">
          <DocumentPageCard
            page={page}
            totalPages={totalPages}
            hasModel={hasModel}
            parseArmed={parseArmed}
          />
        </div>
      </section>
    </div>
  )
})
