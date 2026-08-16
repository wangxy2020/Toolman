import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  type Provider,
  type TranslationLanguage,
} from '@toolman/shared'
import { useI18n } from '../../i18n/useI18n'
import { isModelIdAvailable } from '../chat/model-utils'
import { normalizeTranslationLanguages } from '../chat/translation-utils'
import { resolveTranslationModelId } from './resolve-translation-model-id'
import type { TranslationContrastViewHandle } from './TranslationContrastView'
import type { TranslationDocumentWorkspaceHandle } from './TranslationDocumentWorkspace'
import { hasDocumentExportContent } from './translation-export'
import { buildTranslationPageStatusFallback } from './translation-page-status'
import type {
  SaveTranslationContrastInput,
  SaveTranslationDocumentInput,
} from './useTranslationRecords'
import type { TranslationContrastItem, TranslationDocumentItem, TranslationDocumentPageSnapshot } from './translation-storage'
import type { TranslationSidebarSection } from './translation-sidebar-types'
import { useTranslationSettings } from './useTranslationSettings'
import { useTranslationPageActions } from './useTranslationPageActions'
import { useTranslationPageRecordSync } from './useTranslationPageRecordSync'

export interface TranslationPageProps {
  workspaceId: string | null
  section: TranslationSidebarSection
  providers: Provider[]
  translationLanguages?: [TranslationLanguage, TranslationLanguage]
  activeContrast: TranslationContrastItem | null
  activeDocument: TranslationDocumentItem | null
  onSaveContrast: (input: SaveTranslationContrastInput) => string | null
  onSaveDocument: (input: SaveTranslationDocumentInput) => string | null
  onSaveDocumentToNotes?: (title: string, content: string) => void
  onOpenDocumentPath: (filePath: string) => void
  onUpdateDocumentSourceText: (documentId: string, sourceText: string) => void
  onClearActiveDocument: () => void
}

export function useTranslationPage({
  workspaceId,
  section,
  providers,
  translationLanguages,
  activeContrast,
  activeDocument,
  onSaveContrast,
  onSaveDocument,
  onSaveDocumentToNotes,
  onOpenDocumentPath,
  onUpdateDocumentSourceText,
  onClearActiveDocument,
}: TranslationPageProps) {
  const { t } = useI18n()
  const { settings, updateSettings } = useTranslationSettings()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const isDocuments = section === 'documents'

  const [languages, setLanguages] = useState<[TranslationLanguage, TranslationLanguage]>(() =>
    normalizeTranslationLanguages(
      (isDocuments ? activeDocument?.languages : activeContrast?.languages) ??
        settings.languages ??
        translationLanguages,
    ),
  )
  const [sourceText, setSourceText] = useState(
    isDocuments ? (activeDocument?.sourceText ?? '') : (activeContrast?.sourceText ?? ''),
  )
  const [targetText, setTargetText] = useState(
    isDocuments ? (activeDocument?.targetText ?? '') : (activeContrast?.targetText ?? ''),
  )
  const [error, setError] = useState<string | null>(null)
  const [saveHint, setSaveHint] = useState<string | null>(null)
  const [documentBusy, setDocumentBusy] = useState(false)
  const [documentParsing, setDocumentParsing] = useState(false)
  const [documentParseProgress, setDocumentParseProgress] = useState<{
    completed: number
    total: number
    percent: number
  } | null>(null)
  const [documentError, setDocumentError] = useState<string | null>(null)
  const [documentTotalPages, setDocumentTotalPages] = useState(0)
  const [documentCurrentPage, setDocumentCurrentPage] = useState(1)
  const contrastViewRef = useRef<TranslationContrastViewHandle | null>(null)
  const documentWorkspaceRef = useRef<TranslationDocumentWorkspaceHandle | null>(null)
  const livePageSnapshotsRef = useRef<TranslationDocumentPageSnapshot[]>([])
  const showStatus = useCallback((message: string) => {
    setSaveHint(message)
    window.setTimeout(() => setSaveHint(null), 2000)
  }, [])
  const registerDocumentActions = useCallback(
    (actions: TranslationDocumentWorkspaceHandle | null) => {
      documentWorkspaceRef.current = actions
    },
    [],
  )
  const handlePageSnapshotsChange = useCallback((snapshots: TranslationDocumentPageSnapshot[]) => {
    livePageSnapshotsRef.current = snapshots
  }, [])

  useTranslationPageRecordSync({
    isDocuments,
    activeDocumentId: activeDocument?.id ?? null,
    activeDocumentLanguages: activeDocument?.languages,
    activeDocumentSource: activeDocument?.sourceText ?? '',
    activeDocumentTarget: activeDocument?.targetText ?? '',
    activeContrastId: activeContrast?.id ?? null,
    activeContrastLanguages: activeContrast?.languages,
    activeContrastSource: activeContrast?.sourceText ?? '',
    activeContrastTarget: activeContrast?.targetText ?? '',
    settingsLanguages: settings.languages,
    translationLanguages,
    pageSnapshots: activeDocument?.pageSnapshots,
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
  })

  const sectionLabel = t(`translationPage.sections.${section}`)

  const modelId = useMemo(
    () =>
      resolveTranslationModelId({
        settingsModelId: settings.modelId,
        providers,
      }),
    [providers, settings.modelId],
  )

  useEffect(() => {
    if (providers.length === 0 || !modelId) return
    if (settings.modelId === modelId) return
    if (settings.modelId && isModelIdAvailable(settings.modelId, providers)) return
    updateSettings({ ...settings, modelId })
  }, [modelId, providers, settings, updateSettings])

  const canTranslate = isDocuments
    ? Boolean(modelId && activeDocument)
    : Boolean(modelId)
  const canParse = isDocuments ? Boolean(activeDocument) : false
  const canSave = isDocuments
    ? Boolean(workspaceId && activeDocument && (sourceText.trim() || targetText.trim()))
    : Boolean(workspaceId && (sourceText.trim() || targetText.trim()))
  const canSaveToNotes = isDocuments
    ? Boolean(
        activeDocument &&
          hasDocumentExportContent({
            ...activeDocument,
            sourceText,
            targetText,
          }),
      )
    : false

  const {
    translating,
    handleSwapLanguages,
    handleClear,
    handleSave,
    handleSaveToNotes,
    handleOpenDocument,
    handleOpenExternally,
    handleParse,
    handleTranslate,
    handleSaveSettings,
  } = useTranslationPageActions({
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
  })

  const statusFallback = buildTranslationPageStatusFallback({
    t,
    error,
    setError,
    documentError,
    setDocumentError,
    saveHint,
    isDocuments,
    documentParsing,
    documentParseProgress,
    documentBusy,
    translating,
    modelId,
    providers,
  })

  return {
    t,
    settings,
    settingsOpen,
    setSettingsOpen,
    isDocuments,
    languages,
    sourceText,
    setSourceText,
    targetText,
    setTargetText,
    documentBusy,
    setDocumentBusy,
    documentParsing,
    setDocumentParsing,
    setDocumentParseProgress,
    setDocumentError,
    documentTotalPages,
    documentCurrentPage,
    setDocumentTotalPages,
    setDocumentCurrentPage,
    contrastViewRef,
    documentWorkspaceRef,
    registerDocumentActions,
    handlePageSnapshotsChange,
    sectionLabel,
    modelId,
    translating,
    canTranslate,
    canParse,
    canSave,
    canSaveToNotes,
    handleSwapLanguages,
    handleClear,
    handleSave,
    handleSaveToNotes,
    handleOpenDocument,
    handleOpenExternally,
    handleParse,
    handleTranslate,
    handleSaveSettings,
    statusFallback,
  }
}
