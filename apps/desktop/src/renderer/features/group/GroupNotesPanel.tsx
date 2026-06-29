import { ConfirmDialog } from '../../components/ConfirmDialog'
import { GroupNotePickerModal } from './GroupNotePickerModal'
import { GroupNoteActionMenu } from './GroupNoteActionMenu'
import { GroupFileContextMenu } from './GroupFileContextMenu'
import { GroupMemberResourceSection } from './GroupMemberResourceSection'
import { GroupPanelHeader } from './GroupPanelHeader'
import { GroupSharedNotebookSection } from './GroupSharedNotebookSection'
import type { GroupNotesPanelProps } from './group-notes-panel-types'
import { useGroupNotesPanel } from './useGroupNotesPanel'

export type { GroupNotesPanelProps } from './group-notes-panel-types'

export function GroupNotesPanel(props: GroupNotesPanelProps) {
  const panel = useGroupNotesPanel(props)
  const {
    t,
    workspaceName,
    notebooks,
    notes,
    canWriteWorkspace,
    p2pNotes,
    showPicker,
    setShowPicker,
    noteActionMenu,
    setNoteActionMenu,
    selectedIds,
    removingId,
    removingNotebookId,
    pendingDelete,
    setPendingDelete,
    setRemovingNotebookId,
    contextMenu,
    setContextMenu,
    sharedNoteIds,
    canDeleteResource,
    canManagePermission,
    canManageNotes,
    memberNotebookSections,
    handleToggleSelect,
    handleToggleSelectSection,
    handleSectionKeysChange,
    requestRemoveNotebook,
    handleRemoveNote,
    confirmDelete,
    handleSelectAll,
    handleClearSelection,
    handleDeleteSelected,
    handleContextMenu,
    handleOpenGroupNote,
    handleNoteAction,
    handleConfirmPicker,
  } = panel

  return (
    <div className="tm-group-member-panel tm-group-resource-panel">
      <GroupPanelHeader
        title={t('groupPage.header.notes')}
        subtitle={`${workspaceName} · ${t('groupPage.panels.count', {
          count: p2pNotes.sharedResources.length,
          type: t('groupPage.panels.types.notes'),
        })}`}
      />

      <div className="tm-kb-file-panel" onContextMenu={handleContextMenu}>
        <button
          type="button"
          className="tm-kb-file-dropzone"
          disabled={p2pNotes.sharing || !canWriteWorkspace}
          onClick={() => setShowPicker(true)}
        >
          <span className="tm-kb-file-dropzone-title">
            {p2pNotes.sharing
              ? t('groupPage.panels.adding', { type: t('groupPage.panels.types.notes') })
              : t('groupPage.panels.clickAdd', { type: t('groupPage.panels.types.notes') })}
          </span>
          <span className="tm-kb-file-dropzone-hint">
            {t('groupPage.panels.pickHint', { type: t('groupPage.panels.types.notes') })}
          </span>
        </button>

        {p2pNotes.loading && p2pNotes.sharedResources.length === 0 ? (
          <div className="tm-kb-file-panel-empty">
            <p>{t('groupPage.panels.loading', { type: t('groupPage.panels.types.notes') })}</p>
          </div>
        ) : p2pNotes.sharedResources.length === 0 ? (
          <div className="tm-kb-file-panel-empty">
            <p>{t('groupPage.panels.empty', { type: t('groupPage.panels.types.notes') })}</p>
          </div>
        ) : (
          <div className="tm-group-shared-knowledge-list">
            {memberNotebookSections.map((memberSection) => (
              <GroupMemberResourceSection
                key={memberSection.memberId}
                displayName={memberSection.displayName}
                isSelf={memberSection.isSelf}
                resourceCount={memberSection.notebookSections.reduce(
                  (sum, section) => sum + section.items.length,
                  0,
                )}
                selfLabel={t('groupPage.panels.memberSelf')}
              >
                {memberSection.notebookSections.map((section) => (
                  <GroupSharedNotebookSection
                    key={section.sectionKey}
                    notebookId={section.notebookId}
                    notebookName={section.name}
                    items={section.items}
                    selectedIds={selectedIds}
                    canDeleteNote={canDeleteResource}
                    removingNotebook={removingNotebookId === section.sectionKey}
                    removingId={removingId}
                    onToggleSelect={handleToggleSelect}
                    onToggleSelectSection={handleToggleSelectSection}
                    onRemoveNotebook={() => {
                      requestRemoveNotebook(
                        section.notebookId,
                        section.items.map((item) => item.resource.id),
                      )
                    }}
                    onRemoveNote={handleRemoveNote}
                    onOpenGroupNote={handleOpenGroupNote}
                    onOpenNoteMenu={(resource, note, anchor) =>
                      setNoteActionMenu({ ...anchor, resource, note })
                    }
                    onContextMenu={handleContextMenu}
                    onSectionKeysChange={(_notebookId, resourceIds) =>
                      handleSectionKeysChange(section.sectionKey, resourceIds)
                    }
                  />
                ))}
              </GroupMemberResourceSection>
            ))}
          </div>
        )}
      </div>

      {contextMenu ? (
        <GroupFileContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          selectedCount={selectedIds.size}
          canDelete={canManageNotes}
          onClose={() => setContextMenu(null)}
          onSelectAll={handleSelectAll}
          onClearSelection={handleClearSelection}
          onDeleteSelected={handleDeleteSelected}
        />
      ) : null}

      {pendingDelete ? (
        <ConfirmDialog
          title={t('groupPage.confirm.notes.removeTitle')}
          message={pendingDelete.message}
          confirmLabel={t('groupPage.confirm.remove')}
          danger
          onCancel={() => {
            setPendingDelete(null)
            setRemovingNotebookId(null)
          }}
          onConfirm={() => void confirmDelete()}
        />
      ) : null}

      {showPicker ? (
        <GroupNotePickerModal
          notebooks={notebooks}
          notes={notes}
          sharedNoteIds={sharedNoteIds}
          onClose={() => setShowPicker(false)}
          onConfirm={handleConfirmPicker}
        />
      ) : null}

      {noteActionMenu ? (
        <GroupNoteActionMenu
          x={noteActionMenu.x}
          y={noteActionMenu.y}
          align={noteActionMenu.align}
          permission={
            p2pNotes.sharedResources.find((item) => item.id === noteActionMenu.resource.id)
              ?.permission ?? noteActionMenu.resource.permission
          }
          canSetPermission={canManagePermission(noteActionMenu.resource)}
          onClose={() => setNoteActionMenu(null)}
          onSelect={(action) => handleNoteAction(action)}
        />
      ) : null}
    </div>
  )
}
