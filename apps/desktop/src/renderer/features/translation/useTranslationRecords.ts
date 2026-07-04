import { useCallback, useEffect, useMemo, useState } from 'react'
import type { TranslationLanguage } from '@toolman/shared'
import { normalizeTranslationLanguages } from '../chat/translation-utils'
import { loadTranslationSettings } from './translation-settings-storage'
import {
  buildContrastTitle,
  createDocumentItem,
  createEmptyContrastItem,
  loadTranslationData,
  normalizeContrast,
  normalizeDocument,
  normalizeRenameTitle,
  normalizeTranslationData,
  saveTranslationData,
  uniqueTitle,
  type TranslationData,
  type TranslationDocumentItem,
} from './translation-storage'

export interface SaveTranslationContrastInput {
  sourceText: string
  targetText: string
  languages: [TranslationLanguage, TranslationLanguage]
}

export interface SaveTranslationDocumentInput {
  targetText: string
  languages: [TranslationLanguage, TranslationLanguage]
}

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

  const activeContrast = useMemo(
    () => contrasts.find((item) => item.id === activeContrastId) ?? null,
    [activeContrastId, contrasts],
  )

  const activeDocument = useMemo(
    () => documents.find((item) => item.id === activeDocumentId) ?? null,
    [activeDocumentId, documents],
  )

  const createNewContrast = useCallback((): string | null => {
    setRenameContrastId(null)
    if (!workspaceId) {
      setActiveContrastId(null)
      return null
    }

    const contrast = createEmptyContrastItem(
      workspaceId,
      buildContrastTitle(data.contrasts, workspaceId, '', untitledLabel),
      resolveDefaultLanguages(),
    )

    setData((prev) =>
      normalizeTranslationData({
        ...prev,
        contrasts: [contrast, ...prev.contrasts],
      }),
    )
    setActiveContrastId(contrast.id)
    return contrast.id
  }, [data.contrasts, resolveDefaultLanguages, untitledLabel, workspaceId])

  const openDocument = useCallback(
    (filePath: string): TranslationDocumentItem | null => {
      if (!workspaceId || !filePath.trim()) return null

      const existing = data.documents.find(
        (item) => item.workspaceId === workspaceId && item.filePath === filePath,
      )
      if (existing) {
        setActiveDocumentId(existing.id)
        setRenameDocumentId(null)
        return existing
      }

      const document = createDocumentItem(workspaceId, filePath, resolveDefaultLanguages())
      const titled = normalizeDocument(
        {
          ...document,
          title: uniqueTitle(document.fileName, data.documents, workspaceId),
        },
        workspaceId,
      )

      setData((prev) =>
        normalizeTranslationData({
          ...prev,
          documents: [titled, ...prev.documents],
        }),
      )
      setActiveDocumentId(titled.id)
      setRenameDocumentId(null)
      return titled
    },
    [data.documents, resolveDefaultLanguages, workspaceId],
  )

  const selectContrast = useCallback((contrastId: string) => {
    setActiveContrastId(contrastId)
    setRenameContrastId(null)
  }, [])

  const selectDocument = useCallback((documentId: string) => {
    setActiveDocumentId(documentId)
    setRenameDocumentId(null)
  }, [])

  const clearActiveDocument = useCallback(() => {
    setActiveDocumentId(null)
    setRenameDocumentId(null)
  }, [])

  const startRenameContrast = useCallback((contrastId: string) => {
    setRenameContrastId(contrastId)
  }, [])

  const startRenameDocument = useCallback((documentId: string) => {
    setRenameDocumentId(documentId)
  }, [])

  const cancelRenameContrast = useCallback(() => {
    setRenameContrastId(null)
  }, [])

  const cancelRenameDocument = useCallback(() => {
    setRenameDocumentId(null)
  }, [])

  const renameContrast = useCallback((contrastId: string, title: string) => {
    setData((prev) => ({
      ...prev,
      contrasts: prev.contrasts.map((item) =>
        item.id === contrastId
          ? { ...item, title, updatedAt: Date.now() }
          : item,
      ),
    }))
    setRenameContrastId(null)
  }, [])

  const renameDocument = useCallback((documentId: string, title: string) => {
    setData((prev) => ({
      ...prev,
      documents: prev.documents.map((item) =>
        item.id === documentId
          ? { ...item, title, updatedAt: Date.now() }
          : item,
      ),
    }))
    setRenameDocumentId(null)
  }, [])

  const saveContrast = useCallback(
    (input: SaveTranslationContrastInput): string | null => {
      if (!workspaceId) return null
      const sourceText = input.sourceText
      const targetText = input.targetText
      if (!sourceText.trim() && !targetText.trim()) return null

      const now = Date.now()
      if (activeContrastId) {
        setData((prev) => ({
          ...prev,
          contrasts: prev.contrasts.map((item) =>
            item.id === activeContrastId
              ? normalizeContrast(
                  {
                    ...item,
                    sourceText,
                    targetText,
                    languages: input.languages,
                    updatedAt: now,
                  },
                  workspaceId,
                )
              : item,
          ),
        }))
        return activeContrastId
      }

      const contrast = createEmptyContrastItem(
        workspaceId,
        buildContrastTitle(data.contrasts, workspaceId, sourceText, untitledLabel),
        input.languages,
      )
      const saved = normalizeContrast(
        {
          ...contrast,
          sourceText,
          targetText,
          updatedAt: now,
        },
        workspaceId,
      )

      setData((prev) =>
        normalizeTranslationData({
          ...prev,
          contrasts: [saved, ...prev.contrasts],
        }),
      )
      setActiveContrastId(saved.id)
      return saved.id
    },
    [activeContrastId, data.contrasts, untitledLabel, workspaceId],
  )

  const saveDocument = useCallback(
    (input: SaveTranslationDocumentInput): string | null => {
      if (!workspaceId || !activeDocumentId) return null

      const now = Date.now()
      setData((prev) => ({
        ...prev,
        documents: prev.documents.map((item) =>
          item.id === activeDocumentId
            ? normalizeDocument(
                {
                  ...item,
                  targetText: input.targetText,
                  languages: input.languages,
                  updatedAt: now,
                },
                workspaceId,
              )
            : item,
        ),
      }))
      return activeDocumentId
    },
    [activeDocumentId, workspaceId],
  )

  const updateDocumentSourceText = useCallback(
    (documentId: string, sourceText: string): void => {
      if (!workspaceId) return
      setData((prev) => ({
        ...prev,
        documents: prev.documents.map((item) =>
          item.id === documentId
            ? normalizeDocument(
                {
                  ...item,
                  sourceText,
                  updatedAt: Date.now(),
                },
                workspaceId,
              )
            : item,
        ),
      }))
    },
    [workspaceId],
  )

  const deleteContrast = useCallback((contrastId: string) => {
    setData((prev) => ({
      ...prev,
      contrasts: prev.contrasts.filter((item) => item.id !== contrastId),
    }))
    setActiveContrastId((current) => (current === contrastId ? null : current))
    setRenameContrastId((current) => (current === contrastId ? null : current))
  }, [])

  const deleteDocument = useCallback((documentId: string) => {
    setData((prev) => ({
      ...prev,
      documents: prev.documents.filter((item) => item.id !== documentId),
    }))
    setActiveDocumentId((current) => (current === documentId ? null : current))
    setRenameDocumentId((current) => (current === documentId ? null : current))
  }, [])

  return {
    contrasts,
    documents,
    activeContrastId,
    activeDocumentId,
    activeContrast,
    activeDocument,
    renameContrastId,
    renameDocumentId,
    createNewContrast,
    openDocument,
    selectContrast,
    selectDocument,
    clearActiveDocument,
    startRenameContrast,
    startRenameDocument,
    cancelRenameContrast,
    cancelRenameDocument,
    renameContrast: (contrastId: string, title: string) => {
      const existing = data.contrasts.find((item) => item.id === contrastId)
      renameContrast(
        contrastId,
        normalizeRenameTitle(title, existing?.title ?? untitledLabel),
      )
    },
    renameDocument: (documentId: string, title: string) => {
      const existing = data.documents.find((item) => item.id === documentId)
      renameDocument(
        documentId,
        normalizeRenameTitle(title, existing?.title ?? untitledLabel),
      )
    },
    saveContrast,
    saveDocument,
    updateDocumentSourceText,
    deleteContrast,
    deleteDocument,
  }
}
