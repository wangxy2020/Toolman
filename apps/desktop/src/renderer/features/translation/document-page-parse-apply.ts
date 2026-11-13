import { useCallback } from 'react'
import type { TranslationLanguage } from '@toolman/shared'
import { cachePageState } from './document-page-cache'
import { resolvedPageCount, resolveTranslationSourceText } from './document-page-parse-helpers'
import { reflowTranslationDisplayLines } from './translation-paragraphs'
import type { DocumentPageRefs, DocumentPageSetters, DocumentPageState } from './document-page-types'
import {
  flattenLayoutHtmlTable,
  gfmTablesToHtml,
  hasDisplayableParsePreviewContent,
  hasGfmTableMarkup,
  hasHtmlMarkup,
  hasUsableParsePreviewContent,
  htmlPreviewToVisibleText,
  isLayoutGfmTable,
  isLayoutHtmlTable,
  normalizeGfmTableMarkup,
  repairDocumentPreviewTables,
  sanitizeParsePreviewContent,
  stripBrokenGfmTableNoise,
} from './translation-page-source-quality'

interface ParseApplyDeps {
  filePath: string | null
  documentId: string | null
  modelId: string | null
  languages: [TranslationLanguage, TranslationLanguage]
  autoDetectSource: boolean
  refs: DocumentPageRefs
  setters: Pick<DocumentPageSetters, 'setPages'>
}

export function useDocumentPageParseApply({
  filePath,
  documentId,
  modelId,
  languages,
  autoDetectSource,
  refs,
  setters,
}: ParseApplyDeps) {
  const applyParseResults = useCallback(
    (
      pageNumbers: number[],
      pagesData: Array<{ pageNumber: number; text?: string; markdown?: string }>,
      options?: { emptyAsParsing?: boolean; previewLenient?: boolean },
    ): number[] => {
      const emptyAsParsing = options?.emptyAsParsing ?? false
      const previewLenient = options?.previewLenient ?? false
      const byPage = new Map(pagesData.map((page) => [page.pageNumber, page]))
      const emptyPages: number[] = []
      const patches = new Map<number, Partial<DocumentPageState>>()

      for (const pageNumber of pageNumbers) {
        const row = byPage.get(pageNumber)
        const rawMarkdown = row?.markdown?.trim() ?? row?.text?.trim() ?? ''
        const rawPlain = row?.text?.trim() ?? rawMarkdown
        const { text: plain, markdown } = sanitizeParsePreviewContent(rawPlain, rawMarkdown)
        const hasContent = previewLenient
          ? hasDisplayableParsePreviewContent(plain, markdown)
          : hasUsableParsePreviewContent(plain, markdown)
        const sourceForTranslate = resolveTranslationSourceText(rawPlain, rawMarkdown)
        // Cover/layout grids → prose; real HTML/GFM data tables stay markup for rich render.
        let displayPlain = plain.trim() || rawPlain
        let displayMarkdown = markdown.trim() || rawMarkdown
        const layoutSource = rawMarkdown.trim() || rawPlain.trim() || displayMarkdown || displayPlain
        // Final dual-pane layout: real data tables stay as HTML; layout grids → prose.
        // Apply stays chunked + scroll-gated so this work does not beachball flings.
        if (hasHtmlMarkup(layoutSource) && /<table\b/i.test(layoutSource)) {
          if (isLayoutHtmlTable(layoutSource)) {
            displayPlain = reflowTranslationDisplayLines(flattenLayoutHtmlTable(layoutSource))
            displayMarkdown = displayPlain
          } else {
            // Merge trailing `|8|…|` pipe dumps into the HTML table before display/cache.
            displayMarkdown = repairDocumentPreviewTables(layoutSource)
            displayPlain = htmlPreviewToVisibleText(displayMarkdown)
          }
        } else if (hasGfmTableMarkup(layoutSource) && !isLayoutGfmTable(layoutSource)) {
          const htmlTable = repairDocumentPreviewTables(
            gfmTablesToHtml(normalizeGfmTableMarkup(layoutSource)),
          )
          displayMarkdown = htmlTable
          displayPlain = htmlPreviewToVisibleText(htmlTable)
        } else if (/^\s*\|.+\|/m.test(layoutSource) || (/\|/.test(layoutSource) && !hasGfmTableMarkup(layoutSource))) {
          // Try repair/promote first — isLayoutGfmTable false-positives used to
          // strip real continuation schedules (page 9+) into prose.
          const htmlTable = repairDocumentPreviewTables(layoutSource)
          if (/<table\b/i.test(htmlTable) && !isLayoutHtmlTable(htmlTable)) {
            displayMarkdown = htmlTable
            displayPlain = htmlPreviewToVisibleText(htmlTable)
          } else if (isLayoutGfmTable(layoutSource)) {
            displayPlain = reflowTranslationDisplayLines(stripBrokenGfmTableNoise(layoutSource))
            displayMarkdown = displayPlain
          } else {
            displayPlain = reflowTranslationDisplayLines(stripBrokenGfmTableNoise(layoutSource))
            displayMarkdown = displayPlain
          }
        } else if (!hasHtmlMarkup(layoutSource)) {
          displayPlain = reflowTranslationDisplayLines(displayPlain)
          displayMarkdown = displayPlain
        }
        if (hasContent) {
          patches.set(pageNumber, {
            status: 'parsed',
            translatedText: displayPlain,
            parsedMarkdown: displayMarkdown,
            sourceText: sourceForTranslate || displayPlain,
            error: undefined,
          })
        } else {
          emptyPages.push(pageNumber)
          patches.set(pageNumber, {
            status: emptyAsParsing ? 'parsing' : 'empty',
            translatedText: displayPlain,
            parsedMarkdown: displayMarkdown,
            error: emptyAsParsing ? undefined : 'empty',
          })
        }
      }

      setters.setPages((prev) => {
        const pageLimit = resolvedPageCount(refs.totalPagesRef.current, prev.length)
        let next = prev.map((page) => {
          const patch = patches.get(page.pageNumber)
          if (!patch) return page
          // Never clobber an in-flight / finished translation with a late parse write.
          // That left pages stuck on「已解析」after the user clicked translate.
          if (
            page.status === 'translating' ||
            page.status === 'loading-source' ||
            page.status === 'done'
          ) {
            if (!page.sourceText.trim() && patch.sourceText?.trim()) {
              return { ...page, sourceText: patch.sourceText }
            }
            return page
          }
          return { ...page, ...patch }
        })
        for (const pageNumber of pageNumbers) {
          if (next.some((page) => page.pageNumber === pageNumber)) continue
          if (pageLimit > 0 && pageNumber > pageLimit) continue
          const patch = patches.get(pageNumber)
          if (!patch) continue
          next = [
            ...next,
            {
              pageNumber,
              sourceText: '',
              translatedText: '',
              status: 'idle' as const,
              ...patch,
            },
          ].sort((left, right) => left.pageNumber - right.pageNumber)
        }
        refs.pagesRef.current = next
        if (documentId && filePath) {
          for (const pageNumber of pageNumbers) {
            const updated = next.find((page) => page.pageNumber === pageNumber)
            if (updated) {
              cachePageState(
                documentId,
                filePath,
                modelId,
                languages,
                autoDetectSource,
                updated,
              )
            }
          }
        }
        return next
      })

      return emptyPages
    },
    [autoDetectSource, documentId, filePath, languages, modelId, refs, setters],
  )

  return { applyParseResults }
}
