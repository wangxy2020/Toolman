import { View, type ViewProps } from 'react-native'
import { KnowledgeFileContextMenu } from './KnowledgeFileContextMenu'
import { KnowledgeFilePanelDropzone } from './KnowledgeFilePanelDropzone'
import { KnowledgeFilePanelList } from './KnowledgeFilePanelList'
import { styles } from './KnowledgeFilePanelStyles'
import {
  useKnowledgeFilePanel,
  type KnowledgeFilePanelProps,
} from './useKnowledgeFilePanel'

export type { KnowledgeFilePanelProps }

export function KnowledgeFilePanel(props: KnowledgeFilePanelProps) {
  const {
    documents,
    showDropzone,
    syncMoveTargets = [],
    onReindexDocument,
    onReindexAll,
  } = props
  const {
    dragOver,
    selectedIds,
    menu,
    isUrlMode,
    dropzoneDisabled,
    handlePick,
    openMenu,
    confirmDelete,
    toggleSelected,
    selectAll,
    clearSelection,
    closeMenu,
    handleMoveToSync,
    webDragProps,
  } = useKnowledgeFilePanel(props)

  return (
    <View style={styles.panel} {...(webDragProps as ViewProps)}>
      {showDropzone ? (
        <KnowledgeFilePanelDropzone
          isUrlMode={isUrlMode}
          dragOver={dragOver}
          disabled={dropzoneDisabled}
          onPick={handlePick}
        />
      ) : null}

      <KnowledgeFilePanelList
        documents={documents}
        isUrlMode={isUrlMode}
        selectedIds={selectedIds}
        onOpenMenu={openMenu}
        onReindexDocument={onReindexDocument}
        onConfirmDelete={confirmDelete}
        onToggleSelected={toggleSelected}
      />

      <KnowledgeFileContextMenu
        visible={Boolean(menu)}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        selectedCount={selectedIds.size}
        documentCount={documents.length}
        syncMoveTargets={syncMoveTargets}
        onClose={closeMenu}
        onSelectAll={selectAll}
        onClearSelection={clearSelection}
        onDeleteSelected={() => confirmDelete(Array.from(selectedIds))}
        onReindexAll={onReindexAll}
        onMoveToSync={handleMoveToSync}
      />
    </View>
  )
}
