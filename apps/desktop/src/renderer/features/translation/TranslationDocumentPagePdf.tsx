import { memo, useEffect, useRef, useState, type CSSProperties } from 'react'
import { useI18n } from '../../i18n/useI18n'
import {
  getAnyCachedPageImage,
  getCachedPageImage,
  pageImageCacheKey,
  pinPageImageKey,
  subscribePageImageCache,
  unpinPageImageKey,
} from './document-page-cache'
import { ensurePdfPageImage, isPdfPreviewRenderDropped } from './document-page-preview-load'
import {
  resolvePdfPreviewFastWidth,
  resolvePdfPreviewSharpWidth,
} from './document-page-preview-policy'
import { splitTranslationParagraphs } from './translation-paragraphs'
import type { PageDisplayBox } from './translation-document-workspace-types'
import type { DocumentPageState } from './useDocumentPageTranslation'

function resolvePdfPreviewAspectStyle(pageAspect: number | null): CSSProperties {
  if (pageAspect && pageAspect > 0) {
    return { aspectRatio: `1 / ${pageAspect}` }
  }
  return { aspectRatio: '612 / 792' }
}

type PreviewQuality = 'fast' | 'sharp'

function pickCachedSrc(
  filePath: string,
  pageNumber: number,
  fastKey: string,
  sharpKey: string,
): { src: string | null; quality: PreviewQuality } {
  if (sharpKey) {
    const sharp = getCachedPageImage(sharpKey)
    if (sharp) return { src: sharp, quality: 'sharp' }
  }
  if (fastKey) {
    const fast = getCachedPageImage(fastKey)
    if (fast) return { src: fast, quality: 'fast' }
  }
  // Any prior width for this page beats a white loading slot on remount.
  const any = getAnyCachedPageImage(filePath, pageNumber)
  if (any) return { src: any, quality: 'fast' }
  return { src: null, quality: 'fast' }
}

/**
 * Left-pane view: never blank a mounted frame (white loading slot caused
 * "整页变白" during scan flips). Overlay loading only when there is no src yet.
 * Self-heal only the focused page — neighbors wait for controller prefetch.
 */
const PdfPageRasterImage = memo(function PdfPageRasterImage({
  filePath,
  pageNumber,
  currentPage,
  pageBox,
  pageAspect,
  active,
  scrollSettled,
  cacheEpoch,
  onReady,
}: {
  filePath: string
  pageNumber: number
  currentPage: number
  pageBox: PageDisplayBox
  pageAspect: number | null
  active: boolean
  scrollSettled: boolean
  cacheEpoch: number
  onReady?: (pageNumber: number) => void
}) {
  const { t } = useI18n()
  const fastWidth = resolvePdfPreviewFastWidth(pageBox.width)
  const sharpWidth = resolvePdfPreviewSharpWidth(pageBox.width)
  const aspectStyle = resolvePdfPreviewAspectStyle(pageAspect)
  const fastKey = fastWidth > 0 ? pageImageCacheKey(filePath, pageNumber, fastWidth) : ''
  const sharpKey = sharpWidth > 0 ? pageImageCacheKey(filePath, pageNumber, sharpWidth) : ''
  const initial = pickCachedSrc(filePath, pageNumber, fastKey, sharpKey)
  const [src, setSrc] = useState<string | null>(initial.src)
  const [quality, setQuality] = useState<PreviewQuality>(initial.quality)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(!initial.src)
  const fastRequestIdRef = useRef(0)
  const readySentRef = useRef(false)
  const currentPageRef = useRef(currentPage)
  const srcRef = useRef(src)
  currentPageRef.current = currentPage
  srcRef.current = src
  const isFocused = pageNumber === currentPage

  useEffect(
    () => () => {
      fastRequestIdRef.current += 1
    },
    [],
  )

  // Pin displayed cache keys so LRU eviction cannot revoke an on-screen blob.
  useEffect(() => {
    const keys = [fastKey, sharpKey].filter(Boolean)
    for (const key of keys) pinPageImageKey(key)
    return () => {
      for (const key of keys) unpinPageImageKey(key)
    }
  }, [fastKey, sharpKey])

  const applyCached = useRef<() => boolean>(() => false)
  applyCached.current = () => {
    const next = pickCachedSrc(filePath, pageNumber, fastKey, sharpKey)
    if (!next.src) return false
    setSrc((prev) => (next.src && next.src !== prev ? next.src : prev))
    setQuality(next.quality)
    setError(null)
    setLoading(false)
    return true
  }

  useEffect(() => {
    applyCached.current()
  }, [cacheEpoch, fastKey, sharpKey, filePath, pageNumber])

  useEffect(() => {
    return subscribePageImageCache(() => {
      applyCached.current()
    })
  }, [fastKey, sharpKey, filePath, pageNumber])

  // While focused on a fast frame, poll for the sharp cache entry so a completed
  // worker raster always paints without needing a scroll-driven re-render.
  useEffect(() => {
    if (!isFocused || !sharpKey || quality === 'sharp') return
    const timer = window.setInterval(() => {
      if (getCachedPageImage(sharpKey)) applyCached.current()
    }, 200)
    return () => window.clearInterval(timer)
  }, [isFocused, quality, sharpKey])

  useEffect(() => {
    if (!src || readySentRef.current) return
    readySentRef.current = true
    onReady?.(pageNumber)
  }, [onReady, pageNumber, src])

  // Self-heal when focused + settled and still empty — readable ≥720 first paint.
  useEffect(() => {
    if (!active || !isFocused || !filePath || !scrollSettled) return
    if (fastWidth < 1 || srcRef.current) return

    const requestId = ++fastRequestIdRef.current
    let cancelled = false

    void (async () => {
      setLoading(true)
      setError(null)
      try {
        const url = await ensurePdfPageImage({
          filePath,
          pageNumber,
          renderWidth: fastWidth,
          currentPage: currentPageRef.current,
        })
        if (cancelled || requestId !== fastRequestIdRef.current || !url) return
        setSrc(url)
        setQuality('fast')
      } catch (err) {
        if (cancelled || requestId !== fastRequestIdRef.current) return
        if (isPdfPreviewRenderDropped(err)) return
        if (!srcRef.current) {
          setError(err instanceof Error ? err.message : t('translationPage.documents.previewFailed'))
        }
      } finally {
        if (requestId === fastRequestIdRef.current) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
      fastRequestIdRef.current += 1
    }
  }, [active, fastWidth, filePath, isFocused, pageNumber, scrollSettled, t])

  // Sharp is scheduled only by usePdfPreviewPolicy after readable lands — this view
  // only paints cache updates so 1440px upgrades cannot starve first paint.

  if (error && !src) {
    return (
      <div
        className="tm-translation-doc-page-image-slot tm-translation-doc-page-image-status tm-translation-doc-page-image-status--error"
        style={aspectStyle}
      >
        <p>{error}</p>
      </div>
    )
  }

  if (!src) {
    return (
      <div
        className="tm-translation-doc-page-image-slot tm-translation-doc-page-image-status"
        style={aspectStyle}
        role="status"
        aria-busy={loading || undefined}
      >
        <p>{t('translationPage.documents.loadingPreview')}</p>
      </div>
    )
  }

  return (
    <div className="tm-translation-doc-page-image-slot" style={aspectStyle}>
      <div className="tm-translation-doc-page-image-wrap">
        <img
          className="tm-translation-doc-page-image"
          src={src}
          alt={t('translationPage.documents.pageLabel', {
            page: String(pageNumber),
            total: '',
          })}
          draggable={false}
          decoding="async"
          fetchPriority={isFocused ? 'high' : 'low'}
          data-preview-quality={quality}
        />
        {loading && isFocused ? (
          <div
            className="tm-translation-doc-page-image-status tm-translation-doc-page-image-status--overlay"
            role="status"
            aria-busy="true"
          >
            <p>{t('translationPage.documents.loadingPreview')}</p>
          </div>
        ) : null}
      </div>
    </div>
  )
})

const PdfPageImage = memo(function PdfPageImage({
  filePath,
  pageNumber,
  currentPage,
  pageBox,
  pageAspect,
  active,
  scrollSettled,
  cacheEpoch,
  onReady,
}: {
  filePath: string
  pageNumber: number
  currentPage: number
  pageBox: PageDisplayBox
  pageAspect: number | null
  active: boolean
  scrollSettled: boolean
  cacheEpoch: number
  onReady?: (pageNumber: number) => void
}) {
  return (
    <PdfPageRasterImage
      filePath={filePath}
      pageNumber={pageNumber}
      currentPage={currentPage}
      pageBox={pageBox}
      pageAspect={pageAspect}
      active={active}
      scrollSettled={scrollSettled}
      cacheEpoch={cacheEpoch}
      onReady={onReady}
    />
  )
})

function SourceTextPage({ page }: { page: DocumentPageState }) {
  const paragraphs = splitTranslationParagraphs(page.sourceText)
  if (!page.sourceText.trim()) {
    return <div className="tm-translation-doc-source-page-empty" />
  }
  return (
    <div className="tm-translation-doc-source-page">
      {paragraphs.map((text, index) => (
        <p key={index} className="tm-translation-contrast-para">
          {text || '\u00a0'}
        </p>
      ))}
    </div>
  )
}

export { PdfPageImage, SourceTextPage }
