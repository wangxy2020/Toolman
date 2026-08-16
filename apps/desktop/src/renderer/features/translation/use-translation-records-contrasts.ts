import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react'
import type { TranslationLanguage } from '@toolman/shared'
import {
  buildContrastTitle,
  createEmptyContrastItem,
  normalizeContrast,
  normalizeRenameTitle,
  normalizeTranslationData,
  type TranslationContrastItem,
  type TranslationData,
} from './translation-storage'
import type { SaveTranslationContrastInput } from './use-translation-records-types'

type Options = {
  workspaceId: string | null
  untitledLabel: string
  data: TranslationData
  setData: Dispatch<SetStateAction<TranslationData>>
  activeContrastId: string | null
  setActiveContrastId: Dispatch<SetStateAction<string | null>>
  setRenameContrastId: Dispatch<SetStateAction<string | null>>
  setActiveDocumentId: Dispatch<SetStateAction<string | null>>
  setRenameDocumentId: Dispatch<SetStateAction<string | null>>
  resolveDefaultLanguages: () => [TranslationLanguage, TranslationLanguage]
  contrasts: TranslationContrastItem[]
}

export function useTranslationRecordsContrasts(options: Options) {
  const {
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
  } = options

  const activeContrast = useMemo(
    () => contrasts.find((item) => item.id === activeContrastId) ?? null,
    [activeContrastId, contrasts],
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
  }, [
    data.contrasts,
    resolveDefaultLanguages,
    setActiveContrastId,
    setData,
    setRenameContrastId,
    untitledLabel,
    workspaceId,
  ])

  const selectContrast = useCallback(
    (contrastId: string) => {
      setActiveContrastId(contrastId)
      setRenameContrastId(null)
    },
    [setActiveContrastId, setRenameContrastId],
  )

  const enterContrastSection = useCallback(() => {
    setRenameContrastId(null)
    setRenameDocumentId(null)
    setActiveDocumentId(null)
    setActiveContrastId(contrasts[0]?.id ?? null)
  }, [
    contrasts,
    setActiveContrastId,
    setActiveDocumentId,
    setRenameContrastId,
    setRenameDocumentId,
  ])

  const startRenameContrast = useCallback(
    (contrastId: string) => {
      setRenameContrastId(contrastId)
    },
    [setRenameContrastId],
  )

  const cancelRenameContrast = useCallback(() => {
    setRenameContrastId(null)
  }, [setRenameContrastId])

  const renameContrastRaw = useCallback(
    (contrastId: string, title: string) => {
      setData((prev) => ({
        ...prev,
        contrasts: prev.contrasts.map((item) =>
          item.id === contrastId ? { ...item, title, updatedAt: Date.now() } : item,
        ),
      }))
      setRenameContrastId(null)
    },
    [setData, setRenameContrastId],
  )

  const renameContrast = useCallback(
    (contrastId: string, title: string) => {
      const existing = data.contrasts.find((item) => item.id === contrastId)
      renameContrastRaw(
        contrastId,
        normalizeRenameTitle(title, existing?.title ?? untitledLabel),
      )
    },
    [data.contrasts, renameContrastRaw, untitledLabel],
  )

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
    [activeContrastId, data.contrasts, setActiveContrastId, setData, untitledLabel, workspaceId],
  )

  const deleteContrast = useCallback(
    (contrastId: string) => {
      setData((prev) => ({
        ...prev,
        contrasts: prev.contrasts.filter((item) => item.id !== contrastId),
      }))
      setActiveContrastId((current) => (current === contrastId ? null : current))
      setRenameContrastId((current) => (current === contrastId ? null : current))
    },
    [setActiveContrastId, setData, setRenameContrastId],
  )

  return {
    activeContrast,
    createNewContrast,
    selectContrast,
    enterContrastSection,
    startRenameContrast,
    cancelRenameContrast,
    renameContrast,
    saveContrast,
    deleteContrast,
  }
}
