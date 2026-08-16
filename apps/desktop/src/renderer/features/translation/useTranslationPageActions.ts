import { useCallback, type RefObject } from 'react'
import type { TranslationLanguage } from '@toolman/shared'
import { useTranslate } from '../chat/useTranslate'
import type { TranslationSettings } from './translation-settings-storage'
import type { TranslationContrastViewHandle } from './TranslationContrastView'
import type { SaveTranslationContrastInput } from './useTranslationRecords'
import { useTranslationPageDocumentActions } from './useTranslationPageDocumentActions'
import type { TranslationDocumentItem, TranslationDocumentPageSnapshot } from './translation-storage'
import type { TranslationDocumentWorkspaceHandle } from './TranslationDocumentWorkspace'
import type { MutableRefObject } from 'react'
import type { SaveTranslationDocumentInput } from './useTranslationRecords'

export function useTranslationPageActions(options: {
  t: (key: string, vars?: Record<string, string>) => string
  isDocuments: boolean
  workspaceId: string | null
  languages: [TranslationLanguage, TranslationLanguage]
  setLanguages: React.Dispatch<
    React.SetStateAction<[TranslationLanguage, TranslationLanguage]>
  >
  sourceText: string
  setSourceText: (v: string) => void
  targetText: string
  setTargetText: (v: string) => void
  setError: (v: string | null) => void
  setSaveHint: (v: string | null) => void
  setDocumentBusy: (v: boolean) => void
  setDocumentParsing: (v: boolean) => void
  setDocumentError: (v: string | null) => void
  documentBusy: boolean
  documentParsing: boolean
  modelId: string | null
  canSave: boolean
  canSaveToNotes: boolean
  activeDocument: TranslationDocumentItem | null
  contrastViewRef: RefObject<TranslationContrastViewHandle | null>
  documentWorkspaceRef: MutableRefObject<TranslationDocumentWorkspaceHandle | null>
  livePageSnapshotsRef: MutableRefObject<TranslationDocumentPageSnapshot[]>
  settings: TranslationSettings
  updateSettings: (next: TranslationSettings) => void
  onSaveContrast: (input: SaveTranslationContrastInput) => string | null
  onSaveDocument: (input: SaveTranslationDocumentInput) => string | null
  onSaveDocumentToNotes?: (title: string, content: string) => void
  onOpenDocumentPath: (filePath: string) => void
  onClearActiveDocument: () => void
  showStatus: (message: string) => void
}) {
  const {
    t,
    isDocuments,
    workspaceId,
    languages,
    setLanguages,
    sourceText,
    setSourceText,
    targetText,
    setTargetText,
    setError,
    setSaveHint,
    setDocumentBusy,
    setDocumentParsing,
    setDocumentError,
    documentBusy,
    documentParsing,
    modelId,
    canSave,
    canSaveToNotes,
    activeDocument,
    contrastViewRef,
    documentWorkspaceRef,
    livePageSnapshotsRef,
    settings,
    updateSettings,
    onSaveContrast,
    onSaveDocument,
    onSaveDocumentToNotes,
    onOpenDocumentPath,
    onClearActiveDocument,
    showStatus,
  } = options

  const { translate, translating } = useTranslate()

  const docActions = useTranslationPageDocumentActions({
    t,
    workspaceId,
    languages,
    sourceText,
    targetText,
    setError,
    documentBusy,
    documentParsing,
    modelId,
    canSave,
    canSaveToNotes,
    activeDocument,
    documentWorkspaceRef,
    livePageSnapshotsRef,
    onSaveDocument,
    onSaveDocumentToNotes,
    onOpenDocumentPath,
    showStatus,
  })

  const handleSwapLanguages = useCallback(() => {
    setLanguages((prev) => [prev[1], prev[0]])
    if (!isDocuments) {
      setSourceText(targetText)
      setTargetText(sourceText)
    }
  }, [isDocuments, setLanguages, setSourceText, setTargetText, sourceText, targetText])

  const handleClear = useCallback(() => {
    setError(null)
    setSaveHint(null)
    setDocumentBusy(false)
    setDocumentParsing(false)
    setDocumentError(null)
    setSourceText('')
    setTargetText('')
    if (isDocuments) onClearActiveDocument()
  }, [
    isDocuments,
    onClearActiveDocument,
    setDocumentBusy,
    setDocumentError,
    setDocumentParsing,
    setError,
    setSaveHint,
    setSourceText,
    setTargetText,
  ])

  const handleSave = useCallback(() => {
    if (isDocuments) {
      docActions.handleSaveDocument()
      return
    }
    if (!canSave) return
    const savedId = onSaveContrast({ sourceText, targetText, languages })
    if (!savedId) return
    showStatus(t('translationPage.workspace.saved'))
  }, [canSave, docActions, isDocuments, languages, onSaveContrast, showStatus, sourceText, t, targetText])

  const handleTranslate = useCallback(async () => {
    if (isDocuments) {
      docActions.handleTranslateDocument()
      return
    }
    setError(null)
    if (!modelId) {
      setError(t('translationPage.workspace.noModel'))
      return
    }
    const liveSource = (contrastViewRef.current?.getSourceText() ?? sourceText).trim()
    if (!liveSource) {
      setError(t('translationPage.errors.emptySource'))
      return
    }
    try {
      const result = await translate({
        text: liveSource,
        modelId,
        translationLanguages: languages,
        autoDetectSource: settings.autoDetectSource,
      })
      const translated = result.text.trim()
      if (!translated) {
        setError(t('translationPage.errors.translateFailed'))
        return
      }
      setTargetText(translated)
      if (settings.autoSaveAfterTranslate && workspaceId) {
        const savedId = onSaveContrast({
          sourceText: liveSource,
          targetText: translated,
          languages: [result.sourceLanguage, result.targetLanguage],
        })
        if (savedId) showStatus(t('translationPage.workspace.saved'))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('translationPage.errors.translateFailed'))
    }
  }, [
    contrastViewRef,
    docActions,
    isDocuments,
    languages,
    modelId,
    onSaveContrast,
    setError,
    setTargetText,
    settings.autoDetectSource,
    settings.autoSaveAfterTranslate,
    showStatus,
    sourceText,
    t,
    translate,
    workspaceId,
  ])

  const handleSaveSettings = useCallback(
    (next: TranslationSettings) => {
      updateSettings(next)
      setLanguages(next.languages)
    },
    [setLanguages, updateSettings],
  )

  return {
    translating,
    handleSwapLanguages,
    handleClear,
    handleSave,
    handleSaveToNotes: docActions.handleSaveToNotes,
    handleOpenDocument: docActions.handleOpenDocument,
    handleOpenExternally: docActions.handleOpenExternally,
    handleParse: docActions.handleParse,
    handleTranslate,
    handleSaveSettings,
  }
}
