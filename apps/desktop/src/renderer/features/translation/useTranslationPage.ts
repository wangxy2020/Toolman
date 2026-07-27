import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DialogSelectFilesOutputSchema,
  IpcChannel,
  type Provider,
  type TranslationLanguage,
} from '@toolman/shared'
import { useI18n } from '../../i18n/useI18n'
import { formatModelDisplayLabel, isModelIdAvailable } from '../chat/model-utils'
import { useTranslate } from '../chat/useTranslate'
import { normalizeTranslationLanguages } from '../chat/translation-utils'
import { resolveTranslationModelId } from './resolve-translation-model-id'
import type { TranslationContrastViewHandle } from './TranslationContrastView'
import type { TranslationDocumentWorkspaceHandle } from './TranslationDocumentWorkspace'
import { isTranslationDocumentPath } from './translation-document-utils'
import {
  buildDocumentPageSnapshots,
  aggregateSnapshotSourceText,
  aggregateSnapshotTargetText,
  countRestorableSnapshots,
} from './document-page-snapshots'
import {
  buildDocumentExportContent,
  hasDocumentExportContent,
} from './translation-export'
import type { TranslationSettings } from './translation-settings-storage'
import { useTranslationSettings } from './useTranslationSettings'
import type {
  SaveTranslationContrastInput,
  SaveTranslationDocumentInput,
} from './useTranslationRecords'
import type { TranslationContrastItem, TranslationDocumentItem, TranslationDocumentPageSnapshot } from './translation-storage'
import type { TranslationSidebarSection } from './translation-sidebar-types'

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
  const { translate, translating } = useTranslate()
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

  const activeDocumentId = activeDocument?.id ?? null
  const activeDocumentLanguages = activeDocument?.languages
  const activeDocumentSource = activeDocument?.sourceText ?? ''
  const activeDocumentTarget = activeDocument?.targetText ?? ''
  const activeContrastId = activeContrast?.id ?? null
  const activeContrastSource = activeContrast?.sourceText ?? ''
  const activeContrastTarget = activeContrast?.targetText ?? ''
  const activeContrastLanguages = activeContrast?.languages

  useEffect(() => {
    if (!activeDocumentId) {
      setDocumentTotalPages(0)
      setDocumentCurrentPage(1)
    }
  }, [activeDocumentId])

  useEffect(() => {
    if (isDocuments) {
      setLanguages(
        normalizeTranslationLanguages(
          activeDocumentLanguages ?? settings.languages ?? translationLanguages,
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
        activeContrastLanguages ?? settings.languages ?? translationLanguages,
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
    settings.languages,
    translationLanguages,
  ])

  useEffect(() => {
    if (!isDocuments || !activeDocumentId) return
    const restoredPages = countRestorableSnapshots(activeDocument?.pageSnapshots)
    if (restoredPages > 0) {
      showStatus(
        t('translationPage.documents.restoredFromSave', { count: String(restoredPages) }),
      )
    }
  }, [activeDocument?.pageSnapshots, activeDocumentId, isDocuments, showStatus, t])

  useEffect(() => {
    if (!isDocuments || !activeDocumentId || !sourceText.trim()) return
    const timer = window.setTimeout(() => {
      onUpdateDocumentSourceText(activeDocumentId, sourceText)
    }, 2000)
    return () => window.clearTimeout(timer)
  }, [activeDocumentId, isDocuments, onUpdateDocumentSourceText, sourceText])

  // Never leave the translate icon spinning after leaving document mode.
  useEffect(() => {
    if (!isDocuments) {
      setDocumentBusy(false)
      setDocumentParsing(false)
      setDocumentError(null)
    }
  }, [isDocuments])

  const sectionLabel = t(`translationPage.sections.${section}`)

  const modelId = useMemo(
    () =>
      resolveTranslationModelId({
        settingsModelId: settings.modelId,
        providers,
      }),
    [providers, settings.modelId],
  )

  // Persist preferred default (gemma4 → qwen) when unset or stale.
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

  const handleSwapLanguages = useCallback(() => {
    setLanguages((prev) => [prev[1], prev[0]])
    if (!isDocuments) {
      setSourceText(targetText)
      setTargetText(sourceText)
    }
  }, [isDocuments, sourceText, targetText])

  const handleClear = useCallback(() => {
    setError(null)
    setSaveHint(null)
    setDocumentBusy(false)
    setDocumentParsing(false)
    setDocumentError(null)
    if (isDocuments) {
      setSourceText('')
      setTargetText('')
      onClearActiveDocument()
      return
    }
    setSourceText('')
    setTargetText('')
  }, [isDocuments, onClearActiveDocument])

  const handleSave = useCallback(() => {
    if (!canSave) return
    if (isDocuments) {
      const pageSnapshots =
        documentWorkspaceRef.current?.getPageSnapshots() ??
        livePageSnapshotsRef.current ??
        buildDocumentPageSnapshots([])
      if (pageSnapshots.length === 0) {
        setError(t('translationPage.documents.saveNoSnapshots'))
        return
      }
      const resolvedSource =
        aggregateSnapshotSourceText(pageSnapshots).trim() || sourceText.trim()
      const resolvedTarget =
        aggregateSnapshotTargetText(pageSnapshots).trim() || targetText.trim()

      const savedId = onSaveDocument({
        sourceText: resolvedSource,
        targetText: resolvedTarget,
        languages,
        pageSnapshots,
      })
      if (!savedId) return
      showStatus(
        `${t('translationPage.documents.saved')} ${t('translationPage.documents.savedHint')}`,
      )
      return
    }
    const savedId = onSaveContrast({
      sourceText,
      targetText,
      languages,
    })
    if (!savedId) return
    showStatus(t('translationPage.workspace.saved'))
  }, [
    canSave,
    isDocuments,
    languages,
    onSaveContrast,
    onSaveDocument,
    showStatus,
    sourceText,
    t,
    targetText,
  ])

  const handleSaveToNotes = useCallback(() => {
    if (!canSaveToNotes || !activeDocument || !onSaveDocumentToNotes) return
    const liveDocument = { ...activeDocument, sourceText, targetText }
    if (!hasDocumentExportContent(liveDocument)) {
      setError(t('translationPage.sidebar.exportEmpty'))
      return
    }
    const title = activeDocument.title || activeDocument.fileName
    onSaveDocumentToNotes(title, buildDocumentExportContent(liveDocument))
    showStatus(t('translationPage.documents.savedToNotes', { title }))
  }, [
    activeDocument,
    canSaveToNotes,
    onSaveDocumentToNotes,
    showStatus,
    sourceText,
    t,
    targetText,
  ])

  const handleOpenDocument = useCallback(async () => {
    if (!workspaceId) return
    setError(null)
    const result = await window.api.invoke(IpcChannel.DialogSelectFiles, { multiple: false })
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    const { paths } = DialogSelectFilesOutputSchema.parse(result.data)
    const filePath = paths[0]
    if (!filePath) return
    if (!isTranslationDocumentPath(filePath)) {
      setError(t('translationPage.documents.unsupportedType'))
      return
    }
    onOpenDocumentPath(filePath)
  }, [onOpenDocumentPath, t, workspaceId])

  const handleOpenExternally = useCallback(async () => {
    if (!activeDocument?.filePath) return
    setError(null)
    const result = await window.api.invoke(IpcChannel.AppShellOpenPath, {
      path: activeDocument.filePath,
    })
    if (!result.ok) {
      setError(result.error.message)
    }
  }, [activeDocument?.filePath])

  const handleParse = useCallback(() => {
    setError(null)
    if (!activeDocument) {
      setError(t('translationPage.documents.needDocument'))
      return
    }
    if (documentParsing) {
      documentWorkspaceRef.current?.stopParse()
      return
    }
    const started = documentWorkspaceRef.current?.startParse()
    if (started === false) {
      setError(t('translationPage.documents.parseNotReady'))
    }
  }, [activeDocument, documentParsing, t])

  const handleTranslate = useCallback(async () => {
    setError(null)

    // Document translation: page-by-page pipeline (parse document pages, then translate).
    if (isDocuments) {
      if (!activeDocument || !modelId) {
        setError(t('translationPage.documents.needDocument'))
        return
      }
      if (documentBusy) {
        documentWorkspaceRef.current?.stopTranslation()
        return
      }
      const started = documentWorkspaceRef.current?.startTranslation()
      if (started === false) {
        setError(t('translationPage.documents.translateNotReady'))
      }
      return
    }

    // Contrast translation: plain text only (no document parse IPC).
    if (!modelId) {
      setError(t('translationPage.workspace.noModel'))
      return
    }

    const liveSource = (contrastViewRef.current?.getSourceText() ?? sourceText).trim()
    if (!liveSource) {
      setError(t('translationPage.errors.emptySource'))
      return
    }
    // Keep left pane completely stable — do not touch sourceText unless needed for save.
    const sourceForRequest = liveSource

    try {
      const result = await translate({
        text: sourceForRequest,
        modelId,
        translationLanguages: languages,
        // Word lists / explicit language pair: honor configured direction.
        autoDetectSource: settings.autoDetectSource,
      })
      const translated = result.text.trim()
      if (!translated) {
        setError(t('translationPage.errors.translateFailed'))
        return
      }
      // Only refresh the right pane.
      setTargetText(translated)

      if (settings.autoSaveAfterTranslate && workspaceId) {
        const savedId = onSaveContrast({
          sourceText: sourceForRequest,
          targetText: translated,
          languages: [result.sourceLanguage, result.targetLanguage],
        })
        if (savedId) showStatus(t('translationPage.workspace.saved'))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('translationPage.errors.translateFailed'))
    }
  }, [
    activeDocument,
    documentBusy,
    documentParsing,
    isDocuments,
    languages,
    modelId,
    onSaveContrast,
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
    [updateSettings],
  )

  const statusFallback = error
    ? {
        tone: 'error' as const,
        text: error,
        onDismiss: () => setError(null),
      }
    : documentError
      ? {
          tone: 'error' as const,
          text: documentError,
          onDismiss: () => setDocumentError(null),
        }
      : saveHint
        ? { tone: 'info' as const, text: saveHint }
        : isDocuments && documentParsing && documentParseProgress
          ? {
              tone: 'muted' as const,
              text: t('translationPage.documents.parseProgress', {
                percent: String(documentParseProgress.percent),
                completed: String(documentParseProgress.completed),
                total: String(documentParseProgress.total),
              }),
            }
          : isDocuments && documentParsing
          ? { tone: 'muted' as const, text: t('translationPage.documents.parsePreviewRunning') }
          : isDocuments && documentBusy
            ? { tone: 'muted' as const, text: t('translationPage.documents.pageTranslating') }
            : !isDocuments && translating
            ? {
                tone: 'muted' as const,
                text: t('translationPage.workspace.translatingWithModel', {
                  model: formatModelDisplayLabel(modelId, providers) || (modelId ?? ''),
                }),
              }
            : null

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
