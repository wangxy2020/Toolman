import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DialogSelectFilesOutputSchema,
  IpcChannel,
  type Provider,
  type TranslationLanguage,
} from '@toolman/shared'
import { ErrorBoundary } from '../../components/ErrorBoundary'
import { ModulePageStatusBar } from '../../components/ModulePageStatusBar'
import { ModulePageStatusProvider } from '../../components/module-page-status'
import { useI18n } from '../../i18n/useI18n'
import { formatModelDisplayLabel, isModelIdAvailable } from '../chat/model-utils'
import { useTranslate } from '../chat/useTranslate'
import { normalizeTranslationLanguages } from '../chat/translation-utils'
import { resolveTranslationModelId } from './resolve-translation-model-id'
import {
  TranslationContrastView,
  type TranslationContrastViewHandle,
} from './TranslationContrastView'
import { TranslationDocumentWorkspace } from './TranslationDocumentWorkspace'
import { TranslationPageHeader } from './TranslationPageHeader'
import { TranslationSettingsModal } from './TranslationSettingsModal'
import { isTranslationDocumentPath } from './translation-document-utils'
import type { TranslationSettings } from './translation-settings-storage'
import { useTranslationSettings } from './useTranslationSettings'
import type {
  SaveTranslationContrastInput,
  SaveTranslationDocumentInput,
} from './useTranslationRecords'
import type { TranslationContrastItem, TranslationDocumentItem } from './translation-storage'
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
  onOpenDocumentPath: (filePath: string) => void
  onUpdateDocumentSourceText: (documentId: string, sourceText: string) => void
  onClearActiveDocument: () => void
}

export function TranslationPage({
  workspaceId,
  section,
  providers,
  translationLanguages,
  activeContrast,
  activeDocument,
  onSaveContrast,
  onSaveDocument,
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
  const [documentError, setDocumentError] = useState<string | null>(null)
  const [translateRequestId, setTranslateRequestId] = useState(0)
  const contrastViewRef = useRef<TranslationContrastViewHandle | null>(null)

  const activeDocumentId = activeDocument?.id ?? null
  const activeDocumentLanguages = activeDocument?.languages
  const activeDocumentTarget = activeDocument?.targetText ?? ''
  const activeContrastId = activeContrast?.id ?? null
  const activeContrastSource = activeContrast?.sourceText ?? ''
  const activeContrastTarget = activeContrast?.targetText ?? ''
  const activeContrastLanguages = activeContrast?.languages

  useEffect(() => {
    if (isDocuments) {
      setLanguages(
        normalizeTranslationLanguages(
          activeDocumentLanguages ?? settings.languages ?? translationLanguages,
        ),
      )
      setTargetText(activeDocumentTarget)
      if (!activeDocumentId) {
        setSourceText('')
        setDocumentBusy(false)
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
    activeDocumentTarget,
    isDocuments,
    settings.languages,
    translationLanguages,
  ])

  useEffect(() => {
    if (!isDocuments || !activeDocumentId || !sourceText.trim()) return
    onUpdateDocumentSourceText(activeDocumentId, sourceText)
  }, [activeDocumentId, isDocuments, onUpdateDocumentSourceText, sourceText])

  // Never leave the translate icon spinning after leaving document mode.
  useEffect(() => {
    if (!isDocuments) {
      setDocumentBusy(false)
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
  const canSave = isDocuments
    ? Boolean(workspaceId && activeDocument)
    : Boolean(workspaceId && (sourceText.trim() || targetText.trim()))

  const showStatus = useCallback((message: string) => {
    setSaveHint(message)
    window.setTimeout(() => setSaveHint(null), 2000)
  }, [])

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
      const savedId = onSaveDocument({ targetText, languages })
      if (!savedId) return
      showStatus(t('translationPage.documents.saved'))
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

  const handleTranslate = useCallback(async () => {
    setError(null)

    // Document translation: page-by-page pipeline (parse document pages, then translate).
    if (isDocuments) {
      if (!activeDocument || !modelId) {
        setError(t('translationPage.documents.needDocument'))
        return
      }
      setTranslateRequestId((value) => value + 1)
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

  return (
    <ErrorBoundary title={t('errors.translate')}>
      <main className="tm-main">
        <TranslationPageHeader
          section={section}
          sectionLabel={sectionLabel}
          translating={isDocuments ? documentBusy : translating}
          canTranslate={canTranslate}
          canSave={canSave}
          canOpenExternally={Boolean(activeDocument?.filePath)}
          onSave={handleSave}
          onSwapLanguages={handleSwapLanguages}
          onTranslate={() => void handleTranslate()}
          onClear={handleClear}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenDocument={() => void handleOpenDocument()}
          onOpenExternally={() => void handleOpenExternally()}
        />

        <ModulePageStatusProvider>
          <div className="tm-module-content tm-module-content--translation">
            {!workspaceId ? (
              <div className="tm-module-empty">
                <h2 className="tm-module-empty-title">{sectionLabel}</h2>
                <p className="tm-module-empty-hint">{t('translationPage.selectWorkspace')}</p>
              </div>
            ) : isDocuments ? (
              <TranslationDocumentWorkspace
                modelId={modelId}
                activeDocument={activeDocument}
                languages={languages}
                autoDetectSource={settings.autoDetectSource}
                onOpenDocument={() => void handleOpenDocument()}
                onTargetTextChange={setTargetText}
                onSourceTextChange={setSourceText}
                onBusyChange={setDocumentBusy}
                onErrorChange={setDocumentError}
                translateRequestId={translateRequestId}
              />
            ) : (
              <TranslationContrastView
                ref={contrastViewRef}
                sourceText={sourceText}
                targetText={targetText}
                modelId={modelId}
                onSourceTextChange={setSourceText}
              />
            )}
          </div>

          <ModulePageStatusBar fallback={statusFallback} />
        </ModulePageStatusProvider>

        {settingsOpen ? (
          <TranslationSettingsModal
            settings={settings}
            providers={providers}
            onClose={() => setSettingsOpen(false)}
            onSave={handleSaveSettings}
          />
        ) : null}
      </main>
    </ErrorBoundary>
  )
}
