import { ConfirmDialog } from '../../components/ConfirmDialog'
import { GroupKnowledgePickerModal } from './GroupKnowledgePickerModal'
import { GroupFileContextMenu } from './GroupFileContextMenu'
import { GroupMemberResourceSection } from './GroupMemberResourceSection'
import { GroupPanelHeader } from './GroupPanelHeader'
import { GroupPanelRefreshButton } from './GroupPanelRefreshButton'
import { GroupSharedKnowledgeSection } from './GroupSharedKnowledgeSection'
import { resolveConfirmDeleteTitle } from './group-knowledge-panel-utils'
import { useGroupKnowledgePanel } from './useGroupKnowledgePanel'
import type { GroupKnowledgePanelProps } from './group-knowledge-panel-types'

export type { GroupKnowledgePanelProps } from './group-knowledge-panel-types'

export function GroupKnowledgePanel(props: GroupKnowledgePanelProps) {
  const {
    onOpenNote,
    onOpenGroupNote,
    onOpenGroupKnowledgeMarkdown,
  } = props

  const panel = useGroupKnowledgePanel(props)
  const {
    t,
    workspaceName,
    p2pWorkspaceId,
    sourceWorkspaceId,
    selfMemberId,
    canWriteWorkspace,
    p2pKnowledge,
    showPicker,
    setShowPicker,
    selectedKeys,
    removingKbId,
    removingDocumentId,
    pendingDelete,
    setPendingDelete,
    contextMenu,
    setContextMenu,
    savedDocumentOverrides,
    handleRefresh,
    hasShareableKnowledge,
    memberSections,
    canDeleteResource,
    handleAddKnowledgeBases,
    handleToggleSelect,
    handleToggleSelectSection,
    requestRemoveKb,
    requestRemoveSavedDocuments,
    requestRemoveSavedSection,
    handleSavedDocumentRegistryChange,
    canDeleteSelected,
    handleRemoveDocument,
    confirmDelete,
    handleSectionKeysChange,
    handleSelectAll,
    handleClearSelection,
    handleDeleteSelected,
    deleteSelectedLabel,
    handleContextMenu,
    handleEnsureDocumentSaved,
    resolveResourceLabel,
  } = panel

  return (
    <div className="tm-group-member-panel tm-group-resource-panel">
      <GroupPanelHeader
        title={t('groupPage.header.knowledge')}
        subtitle={`${workspaceName} · ${t('groupPage.panels.count', {
          count: p2pKnowledge.sharedResources.length,
          type: t('groupPage.panels.types.knowledge'),
        })}`}
        actions={
          <GroupPanelRefreshButton
            loading={p2pKnowledge.loading}
            onRefresh={() => void handleRefresh()}
          />
        }
      />

      <div className="tm-kb-file-panel" onContextMenu={handleContextMenu}>
        <button
          type="button"
          className="tm-kb-file-dropzone"
          disabled={
            p2pKnowledge.sharing ||
            !sourceWorkspaceId ||
            !canWriteWorkspace ||
            !hasShareableKnowledge
          }
          onClick={() => setShowPicker(true)}
        >
          <span className="tm-kb-file-dropzone-title">
            {p2pKnowledge.sharing
              ? t('groupPage.panels.adding', { type: t('groupPage.panels.types.knowledge') })
              : t('groupPage.panels.clickAdd', { type: t('groupPage.panels.types.knowledge') })}
          </span>
          <span className="tm-kb-file-dropzone-hint">
            {t('groupPage.panels.pickHint', { type: t('groupPage.panels.types.knowledge') })}
          </span>
        </button>

        {p2pKnowledge.loading && p2pKnowledge.sharedResources.length === 0 ? (
          <div className="tm-kb-file-panel-empty">
            <p>{t('groupPage.panels.loading', { type: t('groupPage.panels.types.knowledge') })}</p>
          </div>
        ) : p2pKnowledge.sharedResources.length === 0 ? (
          <div className="tm-kb-file-panel-empty">
            <p>{t('groupPage.panels.empty', { type: t('groupPage.panels.types.knowledge') })}</p>
          </div>
        ) : (
          <div className="tm-group-shared-knowledge-list">
            {memberSections.map((memberSection) => (
              <GroupMemberResourceSection
                key={memberSection.memberId}
                displayName={memberSection.displayName}
                isSelf={memberSection.isSelf}
                resourceCount={memberSection.resources.length}
                selfLabel={t('groupPage.panels.memberSelf')}
              >
                {memberSection.resources.map((resource) => {
                  const isResourceOwner =
                    selfMemberId != null && resource.sharedBy === selfMemberId
                  return (
                    <GroupSharedKnowledgeSection
                      key={resource.id}
                      p2pWorkspaceId={p2pWorkspaceId}
                      sourceWorkspaceId={sourceWorkspaceId}
                      workspaceName={workspaceName}
                      resource={resource}
                      sectionTitle={resolveResourceLabel(resource)}
                      isResourceOwner={isResourceOwner}
                      savedDocumentOverrides={savedDocumentOverrides[resource.id]}
                      selectedKeys={selectedKeys}
                      canRemoveFromGroup={canDeleteResource(resource)}
                      canRemoveSaved={canWriteWorkspace && !isResourceOwner}
                      canSelect={canWriteWorkspace}
                      removingKb={removingKbId === resource.id}
                      removingDocumentId={removingDocumentId}
                      onToggleSelect={handleToggleSelect}
                      onToggleSelectSection={handleToggleSelectSection}
                      onRemoveFromGroupKb={() => requestRemoveKb(resource.id)}
                      onRemoveFromGroupDocument={(documentId) =>
                        handleRemoveDocument(resource.id, documentId)
                      }
                      onRequestRemoveSavedDocuments={(documentIds) =>
                        requestRemoveSavedDocuments(resource.id, documentIds)
                      }
                      onRequestRemoveSavedSection={() => requestRemoveSavedSection(resource.id)}
                      onSavedDocumentRegistryChange={handleSavedDocumentRegistryChange}
                      onOpenNote={onOpenNote}
                      onOpenGroupNote={onOpenGroupNote}
                      onOpenGroupKnowledgeMarkdown={onOpenGroupKnowledgeMarkdown}
                      onEnsureDocumentSaved={(documentId) =>
                        handleEnsureDocumentSaved(resource, documentId)
                      }
                      onOpenError={(message) => p2pKnowledge.setError(message)}
                      onContextMenu={handleContextMenu}
                      onSectionKeysChange={handleSectionKeysChange}
                    />
                  )
                })}
              </GroupMemberResourceSection>
            ))}
          </div>
        )}
      </div>

      {contextMenu ? (
        <GroupFileContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          selectedCount={selectedKeys.size}
          enabled={canWriteWorkspace}
          canDelete={canDeleteSelected}
          deleteLabel={deleteSelectedLabel}
          onClose={() => setContextMenu(null)}
          onSelectAll={handleSelectAll}
          onClearSelection={handleClearSelection}
          onDeleteSelected={handleDeleteSelected}
        />
      ) : null}

      {pendingDelete ? (
        <ConfirmDialog
          title={resolveConfirmDeleteTitle(pendingDelete.kind, {
            kb: t('groupPage.confirm.removeKbTitle'),
            saved: t('groupPage.confirm.removeSavedCopyTitle'),
            shared: t('groupPage.confirm.removeSharedFileTitle'),
          })}
          message={pendingDelete.message}
          confirmLabel={t('groupPage.confirm.remove')}
          danger
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => void confirmDelete()}
        />
      ) : null}

      {showPicker ? (
        <GroupKnowledgePickerModal
          knowledgeBases={props.knowledgeBases}
          sharedResources={p2pKnowledge.sharedResources}
          sourceWorkspaceId={sourceWorkspaceId}
          onClose={() => setShowPicker(false)}
          onConfirm={handleAddKnowledgeBases}
        />
      ) : null}
    </div>
  )
}
