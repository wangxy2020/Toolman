import { ErrorBoundary } from '../../components/ErrorBoundary'
import { ModulePageStatusBar } from '../../components/ModulePageStatusBar'
import { ModulePageStatusProvider } from '../../components/module-page-status'
import {
  TranslationContrastView,
} from './TranslationContrastView'
import {
  TranslationDocumentWorkspace,
  DOCUMENT_PAGE_ZOOM_DEFAULT,
} from './TranslationDocumentWorkspace'
import { TranslationPageHeader } from './TranslationPageHeader'
import { TranslationSettingsModal } from './TranslationSettingsModal'
import { useTranslationPage, type TranslationPageProps } from './useTranslationPage'

export type { TranslationPageProps }

export function TranslationPage(props: TranslationPageProps) {
  const { workspaceId, section, providers, activeDocument } = props
  const {
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
  } = useTranslationPage(props)

  return (
    <ErrorBoundary title={t('errors.translate')}>
      <main className="tm-main">
        <TranslationPageHeader
          section={section}
          sectionLabel={sectionLabel}
          translating={isDocuments ? documentBusy : translating}
          parsing={isDocuments ? documentParsing : false}
          canTranslate={canTranslate}
          canParse={canParse}
          canSave={canSave}
          canSaveToNotes={canSaveToNotes}
          canOpenExternally={Boolean(activeDocument?.filePath)}
          documentTotalPages={documentTotalPages}
          documentCurrentPage={documentCurrentPage}
          onSave={handleSave}
          onSaveToNotes={isDocuments ? handleSaveToNotes : undefined}
          onSwapLanguages={handleSwapLanguages}
          onParse={() => void handleParse()}
          onTranslate={() => void handleTranslate()}
          onClear={handleClear}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenExternally={() => void handleOpenExternally()}
          onJumpToPage={(pageNumber) => documentWorkspaceRef.current?.scrollToPage(pageNumber)}
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
                ref={documentWorkspaceRef}
                workspaceId={workspaceId}
                modelId={modelId}
                activeDocument={activeDocument}
                languages={languages}
                autoDetectSource={settings.autoDetectSource}
                pdfParserBackend={settings.pdfParserBackend}
                onOpenDocument={() => void handleOpenDocument()}
                onTargetTextChange={setTargetText}
                onSourceTextChange={setSourceText}
                onBusyChange={setDocumentBusy}
                onParsingChange={setDocumentParsing}
                onParseProgressChange={setDocumentParseProgress}
                onPageSnapshotsChange={handlePageSnapshotsChange}
                onErrorChange={setDocumentError}
                onPageMetaChange={({ totalPages, currentPage }) => {
                  setDocumentTotalPages(totalPages)
                  setDocumentCurrentPage(currentPage)
                }}
                pageZoom={DOCUMENT_PAGE_ZOOM_DEFAULT}
                onRegisterActions={registerDocumentActions}
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
