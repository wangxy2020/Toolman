import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react'
import type { TranslationLanguage } from '@toolman/shared'
import {
  createDocumentItem,
  normalizeDocument,
  normalizeRenameTitle,
  normalizeTranslationData,
  uniqueTitle,
  type TranslationData,
  type TranslationDocumentItem,
} from './translation-storage'
import type { SaveTranslationDocumentInput } from './use-translation-records-types'

type Options = {
  workspaceId: string | null
  untitledLabel: string
  data: TranslationData
  setData: Dispatch<SetStateAction<TranslationData>>
  activeDocumentId: string | null
  setActiveDocumentId: Dispatch<SetStateAction<string | null>>
  setRenameDocumentId: Dispatch<SetStateAction<string | null>>
  resolveDefaultLanguages: () => [TranslationLanguage, TranslationLanguage]
  documents: TranslationDocumentItem[]
}

export function useTranslationRecordsDocuments(options: Options) {
  const {
    workspaceId,
    untitledLabel,
    data,
    setData,
    activeDocumentId,
    setActiveDocumentId,
    setRenameDocumentId,
    resolveDefaultLanguages,
    documents,
  } = options

  const activeDocument = useMemo(
    () => documents.find((item) => item.id === activeDocumentId) ?? null,
    [activeDocumentId, documents],
  )

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
    [data.documents, resolveDefaultLanguages, setActiveDocumentId, setData, setRenameDocumentId, workspaceId],
  )

  const selectDocument = useCallback(
    (documentId: string) => {
      setActiveDocumentId(documentId)
      setRenameDocumentId(null)
    },
    [setActiveDocumentId, setRenameDocumentId],
  )

  const clearActiveDocument = useCallback(() => {
    setActiveDocumentId(null)
    setRenameDocumentId(null)
  }, [setActiveDocumentId, setRenameDocumentId])

  const startRenameDocument = useCallback(
    (documentId: string) => {
      setRenameDocumentId(documentId)
    },
    [setRenameDocumentId],
  )

  const cancelRenameDocument = useCallback(() => {
    setRenameDocumentId(null)
  }, [setRenameDocumentId])

  const renameDocumentRaw = useCallback(
    (documentId: string, title: string) => {
      setData((prev) => ({
        ...prev,
        documents: prev.documents.map((item) =>
          item.id === documentId ? { ...item, title, updatedAt: Date.now() } : item,
        ),
      }))
      setRenameDocumentId(null)
    },
    [setData, setRenameDocumentId],
  )

  const renameDocument = useCallback(
    (documentId: string, title: string) => {
      const existing = data.documents.find((item) => item.id === documentId)
      renameDocumentRaw(
        documentId,
        normalizeRenameTitle(title, existing?.title ?? untitledLabel),
      )
    },
    [data.documents, renameDocumentRaw, untitledLabel],
  )

  const saveDocument = useCallback(
    (input: SaveTranslationDocumentInput): string | null => {
      if (!workspaceId || !activeDocumentId) return null
      const hasSnapshots = Boolean(input.pageSnapshots && input.pageSnapshots.length > 0)
      if (!input.sourceText.trim() && !input.targetText.trim() && !hasSnapshots) return null

      const now = Date.now()
      let saved = false
      setData((prev) => {
        const existing = prev.documents.find((item) => item.id === activeDocumentId)
        if (!existing) return prev

        saved = true
        return {
          ...prev,
          documents: prev.documents.map((item) =>
            item.id === activeDocumentId
              ? normalizeDocument(
                  {
                    ...item,
                    sourceText: input.sourceText || item.sourceText,
                    targetText: input.targetText || item.targetText,
                    pageSnapshots: hasSnapshots ? input.pageSnapshots : item.pageSnapshots,
                    languages: input.languages,
                    updatedAt: now,
                  },
                  workspaceId,
                )
              : item,
          ),
        }
      })
      return saved ? activeDocumentId : null
    },
    [activeDocumentId, setData, workspaceId],
  )

  const updateDocumentSourceText = useCallback(
    (documentId: string, sourceText: string): void => {
      if (!workspaceId) return
      setData((prev) => ({
        ...prev,
        documents: prev.documents.map((item) =>
          item.id === documentId
            ? normalizeDocument({ ...item, sourceText }, workspaceId)
            : item,
        ),
      }))
    },
    [setData, workspaceId],
  )

  const deleteDocument = useCallback(
    (documentId: string) => {
      setData((prev) => ({
        ...prev,
        documents: prev.documents.filter((item) => item.id !== documentId),
      }))
      setActiveDocumentId((current) => (current === documentId ? null : current))
      setRenameDocumentId((current) => (current === documentId ? null : current))
    },
    [setActiveDocumentId, setData, setRenameDocumentId],
  )

  return {
    activeDocument,
    openDocument,
    selectDocument,
    clearActiveDocument,
    startRenameDocument,
    cancelRenameDocument,
    renameDocument,
    saveDocument,
    updateDocumentSourceText,
    deleteDocument,
  }
}
