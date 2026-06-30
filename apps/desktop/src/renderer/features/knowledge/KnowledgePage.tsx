import { ErrorBoundary } from '../../components/ErrorBoundary'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { ModulePageStatusBar } from '../../components/ModulePageStatusBar'
import { ModulePageStatusProvider } from '../../components/module-page-status'
import { KnowledgeBaseSettingsModal } from './KnowledgeBaseSettingsModal'
import { KnowledgeAddUrlModal } from './KnowledgeAddUrlModal'
import { KnowledgeFileDedupPanel } from './KnowledgeFileDedupPanel'
import { KnowledgeFileRegistryPanel } from './KnowledgeFileRegistryPanel'
import { KnowledgeFileToolbar } from './KnowledgeFileToolbar'
import { KnowledgeFileContextMenu } from './KnowledgeFileContextMenu'
import { KnowledgePageHeader } from './KnowledgePageHeader'
import { KnowledgePageStatusRegistry } from './KnowledgePageStatusRegistry'
import {
  KnowledgePageSectionContent,
  KnowledgePageSharedFilePanel,
} from './KnowledgePageSectionContent'
import { useKnowledgePage } from './useKnowledgePage'
import type { KnowledgePageProps } from './knowledge-page-types'

export type { KnowledgePageProps } from './knowledge-page-types'

export function KnowledgePage(props: KnowledgePageProps) {
  const {
    workspaceId,
    section,
    knowledgeFolderError,
    networkKnowledgeFolderError,
    localFilesFolderError,
    onOpenNote,
    onChatWithKnowledgeFiles,
  } = props

  const page = useKnowledgePage(props)
  const {
    t, config, error, active, loading, documents,
    settingsTarget, showAddUrlModal, setShowAddUrlModal, selectedIds,
    contextMenu, setContextMenu, sortField, sortAscending, dedupFolderPath,
    setDedupFolderPath, dedupScanState, setDedupScanState, dedupRefreshToken,
    pendingDelete, setPendingDelete, isFileDedupView, isFileRegistryView,
    showingDefaultFolder, showingDefaultNetworkFolder, showingDefaultLocalFilesFolder,
    showingSavedSharedFolder, localDefaultKb,
    networkDefaultKb, localFilesDefaultKb, panelDocuments, chatAttachableFiles,
    sectionLabel, breadcrumbItemName, settingsEnabled, settingsKb, statusFallback,
    importReady, showFileToolbar, isNetworkKbView, panelLoading, importTarget,
    handleChatWithFiles, handleSortFieldChange, handleSelectAll, handleClearSelection,
    handleDeleteSelected, handleImportFiles, handleAddUrl, handleAddSitemap,
    handleReindexAll, handleOpenSettings, handleSelectDedupFolder, handleDedupRefresh,
    handleDedupGoParent, handleContextMenu, handleToggleSelect, handleDeleteDocument,
    confirmDeleteDocuments, handleCloseSettings, handleSettingsSaved, onKbChanged,
  } = page

  const filePanelProps = {
    panelDocuments, panelLoading, importTarget, importReady, isNetworkKbView,
    selectedIds, documents, handleToggleSelect, handleImportFiles, handleDeleteDocument,
    handleContextMenu, onKbChanged, onOpenNote,
    onOpenAddUrl: () => setShowAddUrlModal(true),
    onAddUrl: (url: string) => void handleAddUrl(url).catch((err) => {
      documents.setError(err instanceof Error ? err.message : '网页导入失败')
    }),
  }

  return (
    <ErrorBoundary title={t('errors.knowledge')}>
      <main className="tm-main">
        <KnowledgePageHeader
          sectionLabel={sectionLabel}
          kbName={section === 'shared' || isFileDedupView ? undefined : breadcrumbItemName}
          settingsEnabled={settingsEnabled}
          onOpenSettings={handleOpenSettings}
          dedupMode={isFileDedupView}
          dedupFolderPath={dedupFolderPath}
          dedupScanning={dedupScanState.scanning}
          onSelectDedupFolder={() => void handleSelectDedupFolder()}
          onDedupRefresh={handleDedupRefresh}
          onDedupGoParent={handleDedupGoParent}
          toolbar={showFileToolbar ? (
            <KnowledgeFileToolbar
              sortField={sortField}
              sortAscending={sortAscending}
              onSortFieldChange={handleSortFieldChange}
              onChatWithFiles={onChatWithKnowledgeFiles ? () => handleChatWithFiles() : undefined}
              chatDisabled={selectedIds.size === 0 || chatAttachableFiles.length === 0}
            />
          ) : null}
        />

        <ModulePageStatusProvider>
          <KnowledgePageStatusRegistry
            error={error}
            documentsError={documents.error}
            onClearDocumentsError={() => documents.setError(null)}
            knowledgeFolderError={knowledgeFolderError}
            networkKnowledgeFolderError={networkKnowledgeFolderError}
            localFilesFolderError={localFilesFolderError}
            localDefaultKbError={localDefaultKb.error}
            onClearLocalDefaultKbError={() => localDefaultKb.setError(null)}
            networkDefaultKbError={networkDefaultKb.error}
            onClearNetworkDefaultKbError={() => networkDefaultKb.setError(null)}
            localFilesDefaultKbError={localFilesDefaultKb.error}
            onClearLocalFilesDefaultKbError={() => localFilesDefaultKb.setError(null)}
          />

          <div className="tm-module-content">
            {!workspaceId ? (
              <div className="tm-module-empty">
                <h2 className="tm-module-empty-title">{config.contentEmptyTitle}</h2>
                <p className="tm-module-empty-hint">{t('knowledgePage.selectWorkspace')}</p>
              </div>
            ) : section === 'local' || section === 'network' || section === 'local-files' ? (
              <KnowledgePageSectionContent
                t={t} section={section} active={active} loading={loading}
                showingDefaultFolder={showingDefaultFolder}
                showingDefaultNetworkFolder={showingDefaultNetworkFolder}
                showingDefaultLocalFilesFolder={showingDefaultLocalFilesFolder}
                {...filePanelProps}
              />
            ) : section === 'shared' ? (
              showingSavedSharedFolder ? (
                <KnowledgePageSharedFilePanel {...filePanelProps} />
              ) : (
                <div className="tm-module-empty">
                  <h2 className="tm-module-empty-title">{t('knowledgePage.sections.shared')}</h2>
                  <p className="tm-module-empty-hint">{t('sidebar.knowledge.noFolders')}</p>
                </div>
              )
            ) : section === 'file-tools' ? (
              workspaceId ? (
                isFileRegistryView ? (
                  <KnowledgeFileRegistryPanel workspaceId={workspaceId} />
                ) : (
                  <KnowledgeFileDedupPanel
                    workspaceId={workspaceId}
                    folderPath={dedupFolderPath}
                    onFolderPathChange={setDedupFolderPath}
                    onScanStateChange={setDedupScanState}
                    refreshToken={dedupRefreshToken}
                  />
                )
              ) : (
                <div className="tm-module-empty">
                  <h2 className="tm-module-empty-title">{t('knowledgePage.sections.fileTools')}</h2>
                  <p className="tm-module-empty-hint">{t('knowledgePage.selectWorkspace')}</p>
                </div>
              )
            ) : (
              <div className="tm-module-empty">
                <h2 className="tm-module-empty-title">{t('knowledgePage.sections.local')}</h2>
                <p className="tm-module-empty-hint">{config.contentEmptyHint}</p>
              </div>
            )}
          </div>

          <ModulePageStatusBar fallback={statusFallback} />
        </ModulePageStatusProvider>

        {settingsTarget === 'kb' && workspaceId && settingsKb ? (
          <KnowledgeBaseSettingsModal
            key={settingsKb.id}
            workspaceId={workspaceId}
            kb={settingsKb}
            nameReadOnly={showingDefaultFolder || showingDefaultNetworkFolder || showingDefaultLocalFilesFolder}
            defaultFolderKind={
              showingDefaultFolder ? 'local'
                : showingDefaultNetworkFolder ? 'network'
                  : showingDefaultLocalFilesFolder ? 'local_files' : undefined
            }
            onClose={handleCloseSettings}
            onSaved={handleSettingsSaved}
          />
        ) : null}

        {showAddUrlModal && isNetworkKbView ? (
          <KnowledgeAddUrlModal
            onClose={() => setShowAddUrlModal(false)}
            onSubmitUrl={handleAddUrl}
            onSubmitSitemap={handleAddSitemap}
          />
        ) : null}

        {contextMenu ? (
          <KnowledgeFileContextMenu
            x={contextMenu.x} y={contextMenu.y}
            selectedCount={selectedIds.size}
            documentCount={panelDocuments.length}
            reindexAllDisabled={documents.ingesting}
            onClose={() => setContextMenu(null)}
            onSelectAll={handleSelectAll}
            onClearSelection={handleClearSelection}
            onDeleteSelected={handleDeleteSelected}
            onReindexAll={() => void handleReindexAll()}
          />
        ) : null}

        {pendingDelete ? (
          <ConfirmDialog
            title={t('knowledgePage.deleteFile')}
            message={pendingDelete.message}
            confirmLabel={t('common.delete')}
            cancelLabel={t('common.cancel')}
            danger
            onCancel={() => setPendingDelete(null)}
            onConfirm={() => void confirmDeleteDocuments()}
          />
        ) : null}
      </main>
    </ErrorBoundary>
  )
}
