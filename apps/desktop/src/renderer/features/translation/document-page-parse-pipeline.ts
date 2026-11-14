import { useCallback, useRef } from 'react'
import type { TranslationLanguage } from '@toolman/shared'
import { hydratePagesFromCache } from './document-page-cache'
import { useDocumentPageParseApply } from './document-page-parse-apply'
import { resolveParseDisplayContent } from './document-page-parse-display'
import { runOdlProgressiveParse } from './document-page-parse-run'
import { resolvePageFromSnapshot } from './document-page-snapshots'
import type { DocumentPageRefs, DocumentPageSetters } from './document-page-types'
import type { TranslationDocumentPageSnapshot } from './translation-storage'
import {
  hasUsableParsePreviewContent,
  sanitizeParsePreviewContent,
} from './translation-page-source-quality'

/** Old sessions flattened claim grids to prose — force a fresh ODL pass. */
function parsePreviewLostTableStructure(plain: string, markdown: string): boolean {
  const body = `${markdown}\n${plain}`
  if (/<table\b/i.test(body) || /\|/.test(body)) return false
  return /Claim\s*Item|Amount\s*Claimed|Basis\s*of\s*Claim|Original\s*Invoice/i.test(body)
}

interface ParsePipelineDeps {
  filePath: string | null
  documentId: string | null
  workspaceId: string | null
  modelId: string | null
  languages: [TranslationLanguage, TranslationLanguage]
  autoDetectSource: boolean
  savedPageSnapshots?: TranslationDocumentPageSnapshot[]
  refs: DocumentPageRefs
  setters: DocumentPageSetters
  ensurePageSlots: (count: number) => void
  commitTotalPages: (incoming: number) => void
}

export function useDocumentPageParsePipeline({
  filePath,
  documentId,
  workspaceId,
  modelId,
  languages,
  autoDetectSource,
  savedPageSnapshots,
  refs,
  setters,
  ensurePageSlots,
  commitTotalPages,
}: ParsePipelineDeps) {
  const { applyParseResults } = useDocumentPageParseApply({
    filePath,
    documentId,
    modelId,
    languages,
    autoDetectSource,
    refs,
    setters,
  })
  /** After 清空, ignore stale document snapshots until the next parse rebuilds them. */
  const suppressSnapshotsRef = useRef(false)

  const stopParse = useCallback(() => {
    const wasRunning =
      refs.parseArmedRef.current ||
      refs.odlWarmRunningRef.current ||
      refs.hybridBackfillRunningRef.current ||
      refs.pagesRef.current.some((page) => page.status === 'parsing')
    // Only bump generation when parse work was actually running — a no-op bump
    // here would cancel an in-flight translate that just started after switch.
    if (wasRunning) {
      refs.generationRef.current += 1
    }
    refs.ocrQueueRef.current = []
    refs.ocrWorkerRunningRef.current = false
    refs.centralOcrPipelineRef.current = false
    refs.ocrExhaustedRef.current.clear()
    setters.setOdlWarmRunning(false)
    setters.setHybridBackfillRunning(false)
    setters.setParseArmed(false)
    // Update refs synchronously so a follow-up startTranslation (parse→translate
    // switch) does not still see status=parsing and skip the queue.
    const next = refs.pagesRef.current.map((page) =>
      page.status === 'parsing'
        ? page.translatedText.trim() || page.parsedMarkdown?.trim()
          ? { ...page, status: 'parsed' as const, error: undefined }
          : { ...page, status: 'idle' as const, error: undefined }
        : page,
    )
    refs.pagesRef.current = next
    setters.setPages(next)
    // Do not clear inFlightRef here — translate may claim pages immediately after.
  }, [refs, setters])

  /** Keep PDF page slots; wipe parse/translate bodies (清空). */
  const clearPageContents = useCallback(() => {
    refs.generationRef.current += 1
    refs.parseArmedRef.current = false
    refs.translationArmedRef.current = false
    suppressSnapshotsRef.current = true
    setters.setParseArmed(false)
    setters.setTranslationArmed(false)
    setters.setOdlWarmRunning(false)
    setters.setHybridBackfillRunning(false)
    refs.translateQueueRef.current = []
    refs.translateWorkerRunningRef.current = false
    refs.translateInFlightRef.current.clear()
    refs.translatePageGenerationRef.current.clear()
    refs.ocrQueueRef.current = []
    refs.ocrWorkerRunningRef.current = false
    refs.centralOcrPipelineRef.current = false
    refs.ocrExhaustedRef.current.clear()
    refs.inFlightRef.current.clear()
    refs.pageSourceLoadRef.current.clear()
    const next = refs.pagesRef.current.map((page) => ({
      pageNumber: page.pageNumber,
      sourceText: '',
      translatedText: '',
      parsedMarkdown: '',
      status: 'idle' as const,
      error: undefined,
    }))
    refs.pagesRef.current = next
    setters.setPages(next)
  }, [refs, setters])

  const startParse = useCallback(() => {
    if (refs.pagesRef.current.length === 0) return false

    // Translate → parse switch: disarm translate on refs immediately so scroll /
    // ensure cannot keep enqueueing translate work before React re-renders.
    refs.translationArmedRef.current = false
    refs.parseArmedRef.current = true
    setters.setParseArmed(true)
    setters.setTranslationArmed(false)
    refs.translateQueueRef.current = []
    refs.translateWorkerRunningRef.current = false
    refs.translateInFlightRef.current.clear()
    refs.translatePageGenerationRef.current.clear()

    const count = Math.max(refs.totalPagesRef.current, refs.pagesRef.current.length)
    // Prefer in-memory parse cache / already-painted pages before spending another
    // ODL pass. If every page is already usable, parse is a no-op.
    const liveByPage = new Map(refs.pagesRef.current.map((page) => [page.pageNumber, page]))
    // 清空 races document-record snapshot wipe — never rehydrate flattened
    // claim tables from the previous autosave on the next parse click.
    const snapshotsForRestore = suppressSnapshotsRef.current ? [] : (savedPageSnapshots ?? [])
    suppressSnapshotsRef.current = false
    const snapshotByPage = new Map(
      snapshotsForRestore.map((snapshot) => [snapshot.pageNumber, snapshot]),
    )
    let resetPages =
      documentId && filePath && count > 0
        ? hydratePagesFromCache({
            documentId,
            filePath,
            totalPages: count,
            modelId,
            languages,
            autoDetectSource,
            seedPages: refs.pagesRef.current.map((page) => ({
              pageNumber: page.pageNumber,
              text: page.sourceText,
            })),
          }).map((cached) => {
            const live = liveByPage.get(cached.pageNumber)
            const fromSnapshot = resolvePageFromSnapshot(
              live ?? cached,
              snapshotByPage.get(cached.pageNumber),
            )
            if (
              (fromSnapshot.status === 'parsed' ||
                fromSnapshot.status === 'done' ||
                fromSnapshot.status === 'empty') &&
              (fromSnapshot.status === 'empty' ||
                fromSnapshot.translatedText.trim() ||
                fromSnapshot.parsedMarkdown?.trim())
            ) {
              return fromSnapshot
            }
            if (
              live &&
              (live.status === 'parsed' || live.status === 'done' || live.status === 'empty') &&
              (live.status === 'empty' ||
                live.translatedText.trim() ||
                live.parsedMarkdown?.trim())
            ) {
              return live
            }
            if (cached.status === 'parsed' || cached.status === 'done') return cached
            return live ?? cached
          })
        : refs.pagesRef.current.map((page) =>
            resolvePageFromSnapshot(page, snapshotByPage.get(page.pageNumber)),
          )

    resetPages = resetPages.map((page) => {
      if (page.status === 'parsing' || page.status === 'translating' || page.status === 'loading-source') {
        return { ...page, status: 'idle' as const, error: undefined }
      }
      return page
    })

    resetPages = resetPages.map((page) => {
      if (page.status !== 'parsed' && page.status !== 'done') return page
      // Re-run display resolution so cached GFM claim tables become HTML even
      // when an older session stored pipe markdown / flattened letterheads.
      const sanitized = sanitizeParsePreviewContent(page.translatedText, page.parsedMarkdown)
      const { displayPlain, displayMarkdown } = resolveParseDisplayContent(
        sanitized.text,
        sanitized.markdown,
        page.translatedText,
        page.parsedMarkdown ?? page.translatedText,
      )
      if (
        displayPlain === page.translatedText &&
        displayMarkdown === (page.parsedMarkdown ?? '')
      ) {
        return page
      }
      const hasContent = hasUsableParsePreviewContent(displayPlain, displayMarkdown)
      if (page.status === 'done') {
        return {
          ...page,
          parsedMarkdown: displayMarkdown || page.parsedMarkdown,
        }
      }
      return {
        ...page,
        translatedText: displayPlain,
        parsedMarkdown: displayMarkdown,
        status: hasContent ? ('parsed' as const) : ('empty' as const),
        error: hasContent ? undefined : 'empty',
      }
    })

    const pending = resetPages.filter((page) => {
      // Translated pages: keep Chinese; parse mode only needs the armed flag to
      // prefer parsedMarkdown in the card. Re-ODL only when parse preview is gone.
      if (page.status === 'done') {
        return !hasUsableParsePreviewContent('', page.parsedMarkdown ?? '')
      }
      if (page.status === 'empty') return false
      if (page.status === 'parsed') {
        const sanitized = sanitizeParsePreviewContent(page.translatedText, page.parsedMarkdown)
        if (!hasUsableParsePreviewContent(sanitized.text, sanitized.markdown)) return true
        // Flattened claim letters look "usable" but have no table — re-ODL.
        return parsePreviewLostTableStructure(sanitized.text, sanitized.markdown)
      }
      return page.status === 'idle' || page.status === 'error'
    })

    if (pending.length === 0) {
      refs.pagesRef.current = resetPages
      setters.setPages(resetPages)
      setters.setParseArmed(true)
      setters.setOdlWarmRunning(false)
      setters.setHybridBackfillRunning(false)
      return true
    }

    const pendingForErrors = pending
    if (count > 0) ensurePageSlots(count)

    const pendingNumbers = new Set(pending.map((page) => page.pageNumber))
    const priorByPage = new Map(resetPages.map((page) => [page.pageNumber, page]))
    resetPages = (refs.pagesRef.current.length >= resetPages.length
      ? refs.pagesRef.current
      : resetPages
    ).map((page) => {
      const prior = priorByPage.get(page.pageNumber) ?? page
      if (!pendingNumbers.has(page.pageNumber)) return prior
      return {
        ...prior,
        status: 'parsing' as const,
        error: undefined,
        translatedText: '',
        parsedMarkdown: '',
      }
    })

    refs.pagesRef.current = resetPages
    setters.setPages(resetPages)

    const generation = ++refs.generationRef.current
    refs.ocrQueueRef.current = []
    refs.ocrExhaustedRef.current = new Set(
      resetPages.filter((page) => page.status === 'empty').map((page) => page.pageNumber),
    )
    setters.setOdlWarmRunning(true)

    void runOdlProgressiveParse({
      filePath: filePath!,
      workspaceId,
      documentId,
      modelId,
      languages,
      autoDetectSource,
      generation,
      pending: pendingForErrors,
      refs,
      setters,
      commitTotalPages,
      applyParseResults,
    })

    return true
  }, [
    applyParseResults,
    autoDetectSource,
    commitTotalPages,
    documentId,
    ensurePageSlots,
    savedPageSnapshots,
    filePath,
    languages,
    modelId,
    refs,
    setters,
    workspaceId,
  ])

  return { applyParseResults, startParse, stopParse, clearPageContents }
}
