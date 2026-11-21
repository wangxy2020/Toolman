import type { MouseEvent } from 'react'
import { IconChevronRight, IconPlus } from '../../components/icons'
import { SidebarRenameInput } from '../notes/SidebarRenameInput'
import { TranslationSidebarDocumentItem } from './TranslationSidebarDocumentItem'
import {
  normalizeRenameTitle,
  type TranslationDocumentItem,
  type TranslationFolderItem,
} from './translation-storage'
import type { TranslationSidebarSection } from './translation-sidebar-types'

type Props = {
  t: (key: string) => string
  configEmptyHint: string
  folders: TranslationFolderItem[]
  activeSection: TranslationSidebarSection
  expanded: Set<TranslationSidebarSection>
  documents: TranslationDocumentItem[]
  activeDocumentId: string | null
  renameDocumentId: string | null
  renameFolderId: string | null
  toggleExpanded: (section: TranslationSidebarSection) => void
  handleSectionClick: (section: TranslationSidebarSection) => void
  handleOpenDocument: (folderId: string) => void
  onSelectDocument: (documentId: string) => void
  onRenameDocument: (documentId: string, title: string) => void
  onStartRenameDocument: (documentId: string) => void
  onCancelRenameDocument: () => void
  onRenameFolder: (folderId: string, name: string) => void
  onStartRenameFolder: (folderId: string) => void
  onCancelRenameFolder: () => void
  handleDocumentContextMenu: (event: MouseEvent, document: TranslationDocumentItem) => void
  handleFolderContextMenu: (event: MouseEvent, folder: TranslationFolderItem) => void
}

export function TranslationSidebarSections(props: Props) {
  const {
    t,
    configEmptyHint,
    folders,
    activeSection,
    expanded,
    documents,
    activeDocumentId,
    renameDocumentId,
    renameFolderId,
    toggleExpanded,
    handleSectionClick,
    handleOpenDocument,
    onSelectDocument,
    onRenameDocument,
    onStartRenameDocument,
    onCancelRenameDocument,
    onRenameFolder,
    onStartRenameFolder,
    onCancelRenameFolder,
    handleDocumentContextMenu,
    handleFolderContextMenu,
  } = props

  return (
    <div className="tm-sidebar-list">
      {folders.map((folder) => {
        const isOpen = expanded.has(folder.id)
        const folderDocuments = documents.filter((document) => document.folderId === folder.id)
        const hasActiveChild = folderDocuments.some((document) => document.id === activeDocumentId)
        const isSectionActive = activeSection === folder.id && !hasActiveChild
        const isRenamingFolder = renameFolderId === folder.id

        return (
          <div key={folder.id} className="tm-assistant-group">
            <div
              className={[
                'tm-assistant-row',
                isOpen ? 'tm-assistant-row--open' : '',
                isSectionActive ? 'tm-assistant-row--active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <button
                type="button"
                className="tm-assistant-expand"
                aria-label={isOpen ? t('common.collapse') : t('common.expand')}
                onClick={() => toggleExpanded(folder.id)}
              >
                <IconChevronRight open={isOpen} />
              </button>
              {isRenamingFolder ? (
                <SidebarRenameInput
                  value={folder.name}
                  className="tm-sidebar-rename-input"
                  onCommit={(next) => {
                    onRenameFolder(folder.id, normalizeRenameTitle(next, folder.name))
                    onCancelRenameFolder()
                  }}
                  onCancel={onCancelRenameFolder}
                />
              ) : (
                <button
                  type="button"
                  className={[
                    'tm-assistant-name',
                    folder.isDefault ? 'tm-assistant-name--default' : '',
                    isSectionActive ? 'tm-assistant-name--active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => handleSectionClick(folder.id)}
                  onDoubleClick={(event) => {
                    event.preventDefault()
                    onStartRenameFolder(folder.id)
                  }}
                  onContextMenu={(event) => handleFolderContextMenu(event, folder)}
                  title={folder.name}
                >
                  {folder.name}
                </button>
              )}
              <div className="tm-assistant-actions">
                <button
                  type="button"
                  className="tm-assistant-action-btn"
                  aria-label={t('translationPage.sidebar.openDocument')}
                  onClick={() => handleOpenDocument(folder.id)}
                >
                  <IconPlus size={14} />
                </button>
              </div>
            </div>

            {isOpen ? (
              <div className="tm-assistant-sessions">
                {folderDocuments.length > 0 ? (
                  folderDocuments.map((document) => (
                    <TranslationSidebarDocumentItem
                      key={document.id}
                      document={document}
                      isActive={activeDocumentId === document.id}
                      isRenaming={renameDocumentId === document.id}
                      onSelect={onSelectDocument}
                      onRename={onRenameDocument}
                      onStartRename={() => onStartRenameDocument(document.id)}
                      onCancelRename={onCancelRenameDocument}
                      onContextMenu={handleDocumentContextMenu}
                    />
                  ))
                ) : (
                  <div className="tm-empty tm-translation-sidebar-empty">
                    {t('translationPage.sidebar.emptyDocuments')}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )
      })}

      {folders.length === 0 ? <div className="tm-empty">{configEmptyHint}</div> : null}
    </div>
  )
}
