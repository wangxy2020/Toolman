import { useEffect, useState } from 'react'
import type { MouseEvent } from 'react'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { IconPlus } from '../../components/icons'
import { getModulePageConfig } from '../modules/module-config'
import { useI18n } from '../../i18n/useI18n'
import { TranslationSidebarContextMenu } from './TranslationSidebarContextMenu'
import { TranslationSidebarFolderContextMenu } from './TranslationSidebarFolderContextMenu'
import { TranslationSidebarSections } from './TranslationSidebarSections'
import type { TranslationDocumentItem, TranslationFolderItem } from './translation-storage'
import {
  DEFAULT_TRANSLATION_SECTION,
  type TranslationSidebarSection,
} from './translation-sidebar-types'

interface Props {
  activeSection: TranslationSidebarSection
  onSelectSection: (section: TranslationSidebarSection) => void
  onCreateFolder: () => void
  onRenameFolder: (folderId: string, name: string) => void
  onDeleteFolder: (folderId: string) => void
  onOpenDocument: (folderId: string) => void
  folders: TranslationFolderItem[]
  documents: TranslationDocumentItem[]
  activeDocumentId: string | null
  renameDocumentId: string | null
  onSelectDocument: (documentId: string) => void
  onStartRenameDocument: (documentId: string) => void
  onRenameDocument: (documentId: string, title: string) => void
  onCancelRenameDocument: () => void
  onDeleteDocument: (documentId: string) => void
  onAddDocumentToKnowledge: (document: TranslationDocumentItem) => void
}

export function TranslationSidebar({
  activeSection,
  onSelectSection,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onOpenDocument,
  folders,
  documents,
  activeDocumentId,
  renameDocumentId,
  onSelectDocument,
  onStartRenameDocument,
  onRenameDocument,
  onCancelRenameDocument,
  onDeleteDocument,
  onAddDocumentToKnowledge,
}: Props) {
  const { t } = useI18n()
  const config = getModulePageConfig('translate', t)
  const [expanded, setExpanded] = useState<Set<TranslationSidebarSection>>(
    () => new Set([DEFAULT_TRANSLATION_SECTION]),
  )
  const [renameFolderId, setRenameFolderId] = useState<string | null>(null)

  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.add(activeSection)
      const activeDocument = documents.find((item) => item.id === activeDocumentId)
      if (activeDocument) next.add(activeDocument.folderId)
      return next
    })
  }, [activeDocumentId, activeSection, documents])

  const [documentContextMenu, setDocumentContextMenu] = useState<{
    x: number
    y: number
    document: TranslationDocumentItem
  } | null>(null)
  const [folderContextMenu, setFolderContextMenu] = useState<{
    x: number
    y: number
    folder: TranslationFolderItem
  } | null>(null)
  const [deleteDocumentTarget, setDeleteDocumentTarget] = useState<TranslationDocumentItem | null>(
    null,
  )
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<TranslationFolderItem | null>(null)

  const toggleExpanded = (section: TranslationSidebarSection) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(section)) next.delete(section)
      else next.add(section)
      return next
    })
  }

  const handleSectionClick = (section: TranslationSidebarSection) => {
    onSelectSection(section)
    setExpanded((prev) => new Set(prev).add(section))
  }

  const handleCreateFolder = () => {
    onCreateFolder()
  }

  const handleOpenDocument = (folderId: string) => {
    handleSectionClick(folderId)
    onOpenDocument(folderId)
  }

  const handleDocumentContextMenu = (
    event: MouseEvent,
    document: TranslationDocumentItem,
  ) => {
    event.preventDefault()
    event.stopPropagation()
    setFolderContextMenu(null)
    setDocumentContextMenu({
      x: event.clientX,
      y: event.clientY,
      document,
    })
  }

  const handleFolderContextMenu = (event: MouseEvent, folder: TranslationFolderItem) => {
    event.preventDefault()
    event.stopPropagation()
    setDocumentContextMenu(null)
    setFolderContextMenu({
      x: event.clientX,
      y: event.clientY,
      folder,
    })
  }

  const handleStartRenameFolder = (folderId: string) => {
    setRenameFolderId(folderId)
    onCancelRenameDocument()
  }

  const handleStartRenameDocument = (documentId: string) => {
    setRenameFolderId(null)
    onStartRenameDocument(documentId)
  }

  return (
    <aside className="tm-sidebar">
      <div className="tm-sidebar-content">
        <button type="button" className="tm-sidebar-add" onClick={handleCreateFolder}>
          <IconPlus />
          {t('translationPage.sidebar.newFolder')}
        </button>

        <TranslationSidebarSections
          t={t}
          configEmptyHint={config.sidebarEmptyHint}
          folders={folders}
          activeSection={activeSection}
          expanded={expanded}
          documents={documents}
          activeDocumentId={activeDocumentId}
          renameDocumentId={renameDocumentId}
          renameFolderId={renameFolderId}
          toggleExpanded={toggleExpanded}
          handleSectionClick={handleSectionClick}
          handleOpenDocument={handleOpenDocument}
          onSelectDocument={onSelectDocument}
          onRenameDocument={onRenameDocument}
          onStartRenameDocument={handleStartRenameDocument}
          onCancelRenameDocument={onCancelRenameDocument}
          onRenameFolder={onRenameFolder}
          onStartRenameFolder={handleStartRenameFolder}
          onCancelRenameFolder={() => setRenameFolderId(null)}
          handleDocumentContextMenu={handleDocumentContextMenu}
          handleFolderContextMenu={handleFolderContextMenu}
        />
      </div>

      {documentContextMenu ? (
        <TranslationSidebarContextMenu
          x={documentContextMenu.x}
          y={documentContextMenu.y}
          onClose={() => setDocumentContextMenu(null)}
          onRename={() => handleStartRenameDocument(documentContextMenu.document.id)}
          onAddToKnowledge={() => onAddDocumentToKnowledge(documentContextMenu.document)}
          onDelete={() => setDeleteDocumentTarget(documentContextMenu.document)}
        />
      ) : null}

      {folderContextMenu ? (
        <TranslationSidebarFolderContextMenu
          x={folderContextMenu.x}
          y={folderContextMenu.y}
          canDelete={!folderContextMenu.folder.isDefault}
          onClose={() => setFolderContextMenu(null)}
          onRename={() => handleStartRenameFolder(folderContextMenu.folder.id)}
          onDelete={() => setDeleteFolderTarget(folderContextMenu.folder)}
        />
      ) : null}

      {deleteDocumentTarget ? (
        <ConfirmDialog
          title={t('translationPage.sidebar.deleteDocumentTitle')}
          message={t('translationPage.sidebar.deleteDocumentMessage', {
            title: deleteDocumentTarget.title,
          })}
          confirmLabel={t('common.delete')}
          cancelLabel={t('common.cancel')}
          danger
          onCancel={() => setDeleteDocumentTarget(null)}
          onConfirm={() => {
            onDeleteDocument(deleteDocumentTarget.id)
            setDeleteDocumentTarget(null)
          }}
        />
      ) : null}

      {deleteFolderTarget ? (
        <ConfirmDialog
          title={t('translationPage.sidebar.deleteFolderTitle')}
          message={t('translationPage.sidebar.deleteFolderMessage', {
            name: deleteFolderTarget.name,
          })}
          confirmLabel={t('common.delete')}
          cancelLabel={t('common.cancel')}
          danger
          onCancel={() => setDeleteFolderTarget(null)}
          onConfirm={() => {
            const folderId = deleteFolderTarget.id
            onDeleteFolder(folderId)
            if (activeSection === folderId) {
              onSelectSection(DEFAULT_TRANSLATION_SECTION)
            }
            setDeleteFolderTarget(null)
          }}
        />
      ) : null}
    </aside>
  )
}
