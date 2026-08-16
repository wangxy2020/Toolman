import { useEffect } from 'react'
import type { TranslationLanguage } from '@toolman/shared'
import { normalizeTranslationLanguages } from '../chat/translation-utils'
import { countRestorableSnapshots } from './document-page-snapshots'
import type { TranslationDocumentPageSnapshot } from './translation-storage'

/** Sync languages/text and document busy flags when the active record changes. */
export function useTranslationPageRecordSync(options: {
  isDocuments: boolean
  activeDocumentId: string | null
  activeDocumentLanguages: [TranslationLanguage, TranslationLanguage] | undefined
  activeDocumentSource: string
  activeDocumentTarget: string
  activeContrastId: string | null
  activeContrastLanguages: [TranslationLanguage, TranslationLanguage] | undefined
  activeContrastSource: string
  activeContrastTarget: string
  settingsLanguages: [TranslationLanguage, TranslationLanguage] | undefined
  translationLanguages: [TranslationLanguage, TranslationLanguage] | undefined
  pageSnapshots: TranslationDocumentPageSnapshot[] | undefined
  sourceText: string
  onUpdateDocumentSourceText: (documentId: string, sourceText: string) => void
  setLanguages: (v: [TranslationLanguage, TranslationLanguage]) => void
  setSourceText: (v: string) => void
  setTargetText: (v: string) => void
  setDocumentBusy: (v: boolean) => void
  setDocumentParsing: (v: boolean) => void
  setDocumentError: (v: string | null) => void
  setDocumentTotalPages: (v: number) => void
  setDocumentCurrentPage: (v: number) => void
  showStatus: (message: string) => void
  t: (key: string, vars?: Record<string, string>) => string
}) {
  const {
    isDocuments,
    activeDocumentId,
    activeDocumentLanguages,
    activeDocumentSource,
    activeDocumentTarget,
    activeContrastLanguages,
    activeContrastSource,
    activeContrastTarget,
    activeContrastId,
    settingsLanguages,
    translationLanguages,
    pageSnapshots,
    sourceText,
    onUpdateDocumentSourceText,
    setLanguages,
    setSourceText,
    setTargetText,
    setDocumentBusy,
    setDocumentParsing,
    setDocumentError,
    setDocumentTotalPages,
    setDocumentCurrentPage,
    showStatus,
    t,
  } = options

  useEffect(() => {
    if (!activeDocumentId) {
      setDocumentTotalPages(0)
      setDocumentCurrentPage(1)
    }
  }, [activeDocumentId, setDocumentCurrentPage, setDocumentTotalPages])

  useEffect(() => {
    if (isDocuments) {
      setLanguages(
        normalizeTranslationLanguages(
          activeDocumentLanguages ?? settingsLanguages ?? translationLanguages,
        ),
      )
      setSourceText(activeDocumentSource)
      setTargetText(activeDocumentTarget)
      if (!activeDocumentId) {
        setDocumentBusy(false)
        setDocumentParsing(false)
        setDocumentError(null)
      }
      return
    }
    setLanguages(
      normalizeTranslationLanguages(
        activeContrastLanguages ?? settingsLanguages ?? translationLanguages,
      ),
    )
    setSourceText(activeContrastSource)
    setTargetText(activeContrastTarget)
    setDocumentBusy(false)
    setDocumentError(null)
  }, [
    activeContrastId,
    activeContrastLanguages,
    activeContrastSource,
    activeContrastTarget,
    activeDocumentId,
    activeDocumentLanguages,
    activeDocumentSource,
    activeDocumentTarget,
    isDocuments,
    setDocumentBusy,
    setDocumentError,
    setDocumentParsing,
    setLanguages,
    setSourceText,
    setTargetText,
    settingsLanguages,
    translationLanguages,
  ])

  useEffect(() => {
    if (!isDocuments || !activeDocumentId) return
    const restoredPages = countRestorableSnapshots(pageSnapshots)
    if (restoredPages > 0) {
      showStatus(
        t('translationPage.documents.restoredFromSave', { count: String(restoredPages) }),
      )
    }
  }, [pageSnapshots, activeDocumentId, isDocuments, showStatus, t])

  useEffect(() => {
    if (!isDocuments || !activeDocumentId || !sourceText.trim()) return
    const timer = window.setTimeout(() => {
      onUpdateDocumentSourceText(activeDocumentId, sourceText)
    }, 2000)
    return () => window.clearTimeout(timer)
  }, [activeDocumentId, isDocuments, onUpdateDocumentSourceText, sourceText])

  useEffect(() => {
    if (!isDocuments) {
      setDocumentBusy(false)
      setDocumentParsing(false)
      setDocumentError(null)
    }
  }, [isDocuments, setDocumentBusy, setDocumentError, setDocumentParsing])
}
