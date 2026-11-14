import { useCallback, useEffect, useMemo, useState } from 'react'
import type { TranslationLanguage } from '@toolman/shared'
import { normalizeTranslationLanguages } from '../chat/translation-utils'
import { loadTranslationSettings } from './translation-settings-storage'
import {
  loadTranslationData,
  saveTranslationData,
  type TranslationData,
} from './translation-storage'
import { useTranslationRecordsContrasts } from './use-translation-records-contrasts'
import { useTranslationRecordsDocuments } from './use-translation-records-documents'

export type {
  SaveTranslationContrastInput,
  SaveTranslationDocumentInput,
} from './use-translation-records-types'

export function useTranslationRecords(
  workspaceId: string | null,
  untitledLabel: string,
  translationLanguages?: [TranslationLanguage, TranslationLanguage],
) {
  const [data, setData] = useState<TranslationData>(() => loadTranslationData(workspaceId))
  const [activeContrastId, setActiveContrastId] = useState<string | null>(null)
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null)
  const [renameContrastId, setRenameContrastId] = useState<string | null>(null)
  const [renameDocumentId, setRenameDocumentId] = useState<string | null>(null)

  const resolveDefaultLanguages = useCallback(
    () =>
      normalizeTranslationLanguages(
        loadTranslationSettings().languages ?? translationLanguages,
      ),
    [translationLanguages],
  )

  useEffect(() => {
    setData(loadTranslationData(workspaceId))
    setActiveContrastId(null)
    setActiveDocumentId(null)
    setRenameContrastId(null)
    setRenameDocumentId(null)
  }, [workspaceId])

  useEffect(() => {
    saveTranslationData(data, workspaceId)
  }, [data, workspaceId])

  const contrasts = useMemo(() => {
    if (!workspaceId) return []
    return data.contrasts
      .filter((item) => item.workspaceId === workspaceId)
      .sort((left, right) => right.updatedAt - left.updatedAt)
  }, [data.contrasts, workspaceId])

  const documents = useMemo(() => {
    if (!workspaceId) return []
    return data.documents
      .filter((item) => item.workspaceId === workspaceId)
      .sort((left, right) => right.updatedAt - left.updatedAt)
  }, [data.documents, workspaceId])

  const contrastApi = useTranslationRecordsContrasts({
    workspaceId,
    untitledLabel,
    data,
    setData,
    activeContrastId,
    setActiveContrastId,
    setRenameContrastId,
    setActiveDocumentId,
    setRenameDocumentId,
    resolveDefaultLanguages,
    contrasts,
  })

  const documentApi = useTranslationRecordsDocuments({
    workspaceId,
    untitledLabel,
    data,
    setData,
    activeDocumentId,
    setActiveDocumentId,
    setRenameDocumentId,
    setActiveContrastId,
    setRenameContrastId,
    resolveDefaultLanguages,
    documents,
  })

  return {
    contrasts,
    documents,
    activeContrastId,
    activeDocumentId,
    activeContrast: contrastApi.activeContrast,
    activeDocument: documentApi.activeDocument,
    renameContrastId,
    renameDocumentId,
    openDocument: documentApi.openDocument,
    selectDocument: documentApi.selectDocument,
    clearActiveDocument: documentApi.clearActiveDocument,
    resetDocumentContent: documentApi.resetDocumentContent,
    enterDocumentsSection: documentApi.enterDocumentsSection,
    startRenameDocument: documentApi.startRenameDocument,
    cancelRenameDocument: documentApi.cancelRenameDocument,
    renameDocument: documentApi.renameDocument,
    saveContrast: contrastApi.saveContrast,
    saveDocument: documentApi.saveDocument,
    updateDocumentSourceText: documentApi.updateDocumentSourceText,
    updateDocumentPageSnapshots: documentApi.updateDocumentPageSnapshots,
    updateDocumentPageRemark: documentApi.updateDocumentPageRemark,
    deleteDocument: documentApi.deleteDocument,
  }
}
