import { useCallback, useEffect, useRef, useState } from 'react'
import {
  TranslationDocumentParsePagesOutputSchema,
  IpcChannel,
  type TranslationLanguage,
} from '@toolman/shared'
import { useTranslate } from '../chat/useTranslate'
import {
  cachePageState,
  getCachedSourceText,
  hydratePagesFromCache,
  setCachedSourceText,
} from './document-page-cache'

export type DocumentPageStatus =
  | 'idle'
  | 'loading-source'
  | 'translating'
  | 'done'
  | 'error'
  | 'empty'

export interface DocumentPageState {
  pageNumber: number
  sourceText: string
  translatedText: string
  status: DocumentPageStatus
  error?: string
}

interface Options {
  filePath: string | null
  documentId: string | null
  modelId: string | null
  languages: [TranslationLanguage, TranslationLanguage]
  autoDetectSource: boolean
  enabled: boolean
}

const PARSE_TIMEOUT_MS = 20_000

async function invokeParsePages(path: string, startPage: number, endPage: number) {
  const result = await window.api.invoke(IpcChannel.TranslationDocumentParsePages, {
    path,
    startPage,
    endPage,
  })
  return result
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms)
    promise.then(
      (value) => {
        window.clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        window.clearTimeout(timer)
        reject(error)
      },
    )
  })
}

export function useDocumentPageTranslation({
  filePath,
  documentId,
  modelId,
  languages,
  autoDetectSource,
  enabled,
}: Options) {
  const { translate } = useTranslate()
  const [totalPages, setTotalPages] = useState(0)
  const [pages, setPages] = useState<DocumentPageState[]>([])
  /** PDF page height / width in points (FitH aspect). */
  const [pageAspect, setPageAspect] = useState<number | null>(null)
  const [bootstrapping, setBootstrapping] = useState(false)
  const [bootstrapError, setBootstrapError] = useState<string | null>(null)
  /** User must click translate (or scroll after starting) before pages auto-translate. */
  const [translationArmed, setTranslationArmed] = useState(false)
  const inFlightRef = useRef<Set<number>>(new Set())
  const pagesRef = useRef<DocumentPageState[]>([])
  const generationRef = useRef(0)

  useEffect(() => {
    pagesRef.current = pages
  }, [pages])

  const updatePage = useCallback(
    (pageNumber: number, patch: Partial<DocumentPageState>) => {
      setPages((prev) => {
        const next = prev.map((page) =>
          page.pageNumber === pageNumber ? { ...page, ...patch } : page,
        )
        const updated = next.find((page) => page.pageNumber === pageNumber)
        if (updated && documentId && filePath) {
          cachePageState(documentId, filePath, modelId, languages, autoDetectSource, updated)
        }
        return next
      })
    },
    [autoDetectSource, documentId, filePath, languages, modelId],
  )

  const ensurePageSlots = useCallback((count: number) => {
    setPages((prev) => {
      if (prev.length >= count) return prev
      const next = [...prev]
      for (let pageNumber = prev.length + 1; pageNumber <= count; pageNumber += 1) {
        next.push({
          pageNumber,
          sourceText: '',
          translatedText: '',
          status: 'idle',
        })
      }
      return next
    })
  }, [])

  const loadPageSource = useCallback(
    async (pageNumber: number, generation: number): Promise<string> => {
      if (!filePath) return ''
      const existing = pagesRef.current.find((page) => page.pageNumber === pageNumber)
      if (existing?.sourceText.trim()) return existing.sourceText

      const cachedSource = getCachedSourceText(filePath, pageNumber)
      if (cachedSource?.trim()) {
        updatePage(pageNumber, {
          sourceText: cachedSource,
          status: 'idle',
          error: undefined,
        })
        return cachedSource
      }

      updatePage(pageNumber, { status: 'loading-source', error: undefined })
      try {
        const result = await withTimeout(
          invokeParsePages(filePath, pageNumber, pageNumber),
          PARSE_TIMEOUT_MS,
          '解析页面超时',
        )
        if (generation !== generationRef.current) return ''

        if (!result.ok) {
          updatePage(pageNumber, { status: 'error', error: result.error.message })
          throw new Error(result.error.message)
        }

        const data = TranslationDocumentParsePagesOutputSchema.parse(result.data)
        setTotalPages(data.totalPages)
        ensurePageSlots(data.totalPages)
        const text = data.pages[0]?.text?.trim() ?? ''
        if (text) setCachedSourceText(filePath, pageNumber, text)
        updatePage(pageNumber, {
          sourceText: text,
          status: text ? 'idle' : 'empty',
          error: text ? undefined : 'empty',
        })
        return text
      } catch (error) {
        if (generation !== generationRef.current) return ''
        const message = error instanceof Error ? error.message : '解析页面失败'
        updatePage(pageNumber, { status: 'error', error: message })
        throw error
      }
    },
    [ensurePageSlots, filePath, updatePage],
  )

  const translatePage = useCallback(
    async (pageNumber: number) => {
      if (!enabled || !filePath || !modelId) return
      if (inFlightRef.current.has(pageNumber)) return

      const generation = generationRef.current
      const current = pagesRef.current.find((page) => page.pageNumber === pageNumber)
      if (current?.status === 'done' && current.translatedText.trim()) return
      if (current?.status === 'empty') return

      inFlightRef.current.add(pageNumber)
      try {
        const sourceText = current?.sourceText.trim()
          ? current.sourceText
          : await loadPageSource(pageNumber, generation)
        if (generation !== generationRef.current) return
        if (!sourceText.trim()) {
          updatePage(pageNumber, { status: 'empty', translatedText: '' })
          return
        }

        updatePage(pageNumber, { status: 'translating', error: undefined })
        const result = await translate({
          text: sourceText,
          modelId,
          translationLanguages: languages,
          autoDetectSource,
        })
        if (generation !== generationRef.current) return
        updatePage(pageNumber, {
          status: 'done',
          translatedText: result.text,
          error: undefined,
        })
      } catch (error) {
        if (generation !== generationRef.current) return
        updatePage(pageNumber, {
          status: 'error',
          error: error instanceof Error ? error.message : 'translate failed',
        })
      } finally {
        inFlightRef.current.delete(pageNumber)
      }
    },
    [autoDetectSource, enabled, filePath, languages, loadPageSource, modelId, translate, updatePage],
  )

  const ensurePageReady = useCallback(
    async (pageNumber: number) => {
      if (!enabled || !translationArmed || pageNumber < 1) return
      if (totalPages > 0 && pageNumber > totalPages) return
      await translatePage(pageNumber)
    },
    [enabled, totalPages, translatePage, translationArmed],
  )

  const startTranslation = useCallback(() => {
    setTranslationArmed(true)
    const currentPages = pagesRef.current
    const nextPage =
      currentPages.find((page) => page.status === 'idle' || page.status === 'error') ??
      currentPages.find((page) => page.status !== 'done' && page.status !== 'empty') ??
      currentPages[0]
    if (nextPage) void translatePage(nextPage.pageNumber)
  }, [translatePage])

  // Bootstrap: only discover pages / load first-page source. Do not auto-translate.
  useEffect(() => {
    if (!enabled || !filePath || !documentId) {
      generationRef.current += 1
      setTotalPages(0)
      setPages([])
      setPageAspect(null)
      setBootstrapError(null)
      setBootstrapping(false)
      setTranslationArmed(false)
      inFlightRef.current.clear()
      return
    }

    const generation = ++generationRef.current
    let cancelled = false
    setBootstrapping(true)
    setBootstrapError(null)
    setPages([])
    setTotalPages(0)
    setPageAspect(null)
    setTranslationArmed(false)
    inFlightRef.current.clear()

    void (async () => {
      try {
        const result = await withTimeout(
          invokeParsePages(filePath, 1, 1),
          PARSE_TIMEOUT_MS,
          '解析文档超时，请重试或用系统应用打开文件',
        )
        if (cancelled || generation !== generationRef.current) return
        if (!result.ok) {
          setBootstrapError(result.error.message)
          return
        }

        const data = TranslationDocumentParsePagesOutputSchema.parse(result.data)
        const count = Math.max(1, data.totalPages)
        setTotalPages(count)
        if (data.pageWidth && data.pageHeight && data.pageWidth > 0) {
          setPageAspect(data.pageHeight / data.pageWidth)
        } else {
          setPageAspect(null)
        }

        const initialPages = hydratePagesFromCache({
          documentId,
          filePath,
          totalPages: count,
          modelId,
          languages,
          autoDetectSource,
          seedPages: data.pages.map((page) => ({
            pageNumber: page.pageNumber,
            text: page.text,
          })),
        })
        setPages(initialPages)
        pagesRef.current = initialPages
        if (initialPages.some((page) => page.status === 'done')) {
          setTranslationArmed(true)
        }
      } catch (error) {
        if (cancelled || generation !== generationRef.current) return
        setBootstrapError(error instanceof Error ? error.message : 'bootstrap failed')
      } finally {
        if (!cancelled && generation === generationRef.current) {
          setBootstrapping(false)
        }
      }
    })()

    return () => {
      cancelled = true
      generationRef.current += 1
      inFlightRef.current.clear()
    }
  }, [autoDetectSource, documentId, enabled, filePath, languages, modelId])

  const translatedText = pages
    .filter((page) => page.translatedText.trim())
    .map((page) => page.translatedText.trim())
    .join('\n\n')

  const busy =
    bootstrapping ||
    pages.some((page) => page.status === 'loading-source' || page.status === 'translating')

  return {
    totalPages,
    pages,
    pageAspect,
    bootstrapping,
    bootstrapError,
    busy,
    translationArmed,
    ensurePageReady,
    translatePage,
    startTranslation,
    translatedText,
  }
}
