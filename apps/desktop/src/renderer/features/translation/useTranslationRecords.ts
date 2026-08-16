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
  const [data, setData] = useState<TranslationData>(() => loadTranslationData())
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
    saveTranslationData(data)
  }, [data])

  useEffect(() => {
    setActiveDocumentId(null)
    setRenameDocumentId(null)
  }, [workspaceId])

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
    createNewContrast: contrastApi.createNewContrast,
    openDocument: documentApi.openDocument,
    selectContrast: contrastApi.selectContrast,
    selectDocument: documentApi.selectDocument,
    clearActiveDocument: documentApi.clearActiveDocument,
    enterContrastSection: contrastApi.enterContrastSection,
    startRenameContrast: contrastApi.startRenameContrast,
    startRenameDocument: documentApi.startRenameDocument,
    cancelRenameContrast: contrastApi.cancelRenameContrast,
    cancelRenameDocument: documentApi.cancelRenameDocument,
    renameContrast: contrastApi.renameContrast,
    renameDocument: documentApi.renameDocument,
    saveContrast: contrastApi.saveContrast,
    saveDocument: documentApi.saveDocument,
    updateDocumentSourceText: documentApi.updateDocumentSourceText,
    deleteContrast: contrastApi.deleteContrast,
    deleteDocument: documentApi.deleteDocument,
  }
}
