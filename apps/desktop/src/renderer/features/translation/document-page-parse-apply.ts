import { useCallback } from 'react'
import type { TranslationLanguage } from '@toolman/shared'
import { cachePageState } from './document-page-cache'
import { resolvedPageCount, resolveTranslationSourceText } from './document-page-parse-helpers'
import { resolveParseDisplayContent } from './document-page-parse-display'
import type { DocumentPageRefs, DocumentPageSetters, DocumentPageState } from './document-page-types'
import {
  hasDisplayableParsePreviewContent,
  hasUsableParsePreviewContent,
  sanitizeParsePreviewContent,
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
        const { displayPlain, displayMarkdown } = resolveParseDisplayContent(
          plain,
          markdown,
          rawPlain,
          rawMarkdown,
        )
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
        // Prefer refs when commitTotalPages just expanded slots — a stale `prev`
        // of only the probe pages would otherwise shrink the list back and make
        // progress jump to 100% (2/2) while later batches are still running.
        const seed =
          refs.pagesRef.current.length >= prev.length ? refs.pagesRef.current : prev
        const fillStatus = emptyAsParsing ? ('parsing' as const) : ('idle' as const)
        let next = seed.map((page) => {
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
        if (pageLimit > next.length) {
          for (let pageNumber = next.length + 1; pageNumber <= pageLimit; pageNumber += 1) {
            const patch = patches.get(pageNumber)
            next.push({
              pageNumber,
              sourceText: '',
              translatedText: '',
              status: fillStatus,
              ...patch,
            })
          }
        }
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
              status: fillStatus,
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
