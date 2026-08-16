import { useEffect, useState } from 'react'
import type { MouseEvent } from 'react'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { IconPlus } from '../../components/icons'
import { getModulePageConfig } from '../modules/module-config'
import { useI18n } from '../../i18n/useI18n'
import { TranslationSidebarContextMenu } from './TranslationSidebarContextMenu'
import { TranslationSidebarSections } from './TranslationSidebarSections'
import type { TranslationContrastItem, TranslationDocumentItem } from './translation-storage'
import {
  DEFAULT_TRANSLATION_SECTION,
  type TranslationSidebarSection,
} from './translation-sidebar-types'

interface Props {
  activeSection: TranslationSidebarSection
  onSelectSection: (section: TranslationSidebarSection) => void
  onCreateContrast: () => void
  onOpenDocument: () => void
  contrasts: TranslationContrastItem[]
  documents: TranslationDocumentItem[]
  activeContrastId: string | null
  activeDocumentId: string | null
  renameContrastId: string | null
  renameDocumentId: string | null
  onSelectContrast: (contrastId: string) => void
  onSelectDocument: (documentId: string) => void
  onStartRenameContrast: (contrastId: string) => void
  onStartRenameDocument: (documentId: string) => void
  onRenameContrast: (contrastId: string, title: string) => void
  onRenameDocument: (documentId: string, title: string) => void
  onCancelRenameContrast: () => void
  onCancelRenameDocument: () => void
  onDeleteContrast: (contrastId: string) => void
  onDeleteDocument: (documentId: string) => void
  onAddContrastToKnowledge: (contrast: TranslationContrastItem) => void
  onAddDocumentToKnowledge: (document: TranslationDocumentItem) => void
  onAddContrastToNotes: (contrast: TranslationContrastItem) => void
  onAddDocumentToNotes: (document: TranslationDocumentItem) => void
}

export function TranslationSidebar({
  activeSection,
  onSelectSection,
  onCreateContrast,
  onOpenDocument,
  contrasts,
  documents,
  activeContrastId,
  activeDocumentId,
  renameContrastId,
  renameDocumentId,
  onSelectContrast,
  onSelectDocument,
  onStartRenameContrast,
  onStartRenameDocument,
  onRenameContrast,
  onRenameDocument,
  onCancelRenameContrast,
  onCancelRenameDocument,
  onDeleteContrast,
  onDeleteDocument,
  onAddContrastToKnowledge,
  onAddDocumentToKnowledge,
  onAddContrastToNotes,
  onAddDocumentToNotes,
}: Props) {
  const { t } = useI18n()
  const config = getModulePageConfig('translate', t)
  const [expanded, setExpanded] = useState<Set<TranslationSidebarSection>>(
    () => new Set([DEFAULT_TRANSLATION_SECTION]),
  )

  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.add(activeSection)
      if (activeDocumentId) next.add('documents')
      return next
    })
  }, [activeDocumentId, activeSection])
  const [contrastContextMenu, setContrastContextMenu] = useState<{
    x: number
    y: number
    contrast: TranslationContrastItem
  } | null>(null)
  const [documentContextMenu, setDocumentContextMenu] = useState<{
    x: number
    y: number
    document: TranslationDocumentItem
  } | null>(null)
  const [deleteContrastTarget, setDeleteContrastTarget] = useState<TranslationContrastItem | null>(
    null,
  )
  const [deleteDocumentTarget, setDeleteDocumentTarget] = useState<TranslationDocumentItem | null>(
    null,
  )

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

  const handleCreateContrast = () => {
    handleSectionClick(DEFAULT_TRANSLATION_SECTION)
    onCreateContrast()
  }

  const handleOpenDocument = () => {
    handleSectionClick('documents')
    onOpenDocument()
  }

  const handleContrastContextMenu = (
    event: MouseEvent,
    contrast: TranslationContrastItem,
  ) => {
    event.preventDefault()
    event.stopPropagation()
    setDocumentContextMenu(null)
    setContrastContextMenu({
      x: event.clientX,
      y: event.clientY,
      contrast,
    })
  }

  const handleDocumentContextMenu = (
    event: MouseEvent,
    document: TranslationDocumentItem,
  ) => {
    event.preventDefault()
    event.stopPropagation()
    setContrastContextMenu(null)
    setDocumentContextMenu({
      x: event.clientX,
      y: event.clientY,
      document,
    })
  }

  return (
    <aside className="tm-sidebar">
      <div className="tm-sidebar-content">
        <button
          type="button"
          className="tm-sidebar-add"
          onClick={activeSection === 'documents' ? handleOpenDocument : handleCreateContrast}
        >
          <IconPlus />
          {activeSection === 'documents'
            ? t('translationPage.sidebar.newDocument')
            : t('translationPage.sidebar.newContrast')}
        </button>

        <TranslationSidebarSections
          t={t}
          configEmptyHint={config.sidebarEmptyHint}
          activeSection={activeSection}
          expanded={expanded}
          contrasts={contrasts}
          documents={documents}
          activeContrastId={activeContrastId}
          activeDocumentId={activeDocumentId}
          renameContrastId={renameContrastId}
          renameDocumentId={renameDocumentId}
          toggleExpanded={toggleExpanded}
          handleSectionClick={handleSectionClick}
          handleCreateContrast={handleCreateContrast}
          handleOpenDocument={handleOpenDocument}
          onSelectContrast={onSelectContrast}
          onSelectDocument={onSelectDocument}
          onRenameContrast={onRenameContrast}
          onRenameDocument={onRenameDocument}
          onStartRenameContrast={onStartRenameContrast}
          onStartRenameDocument={onStartRenameDocument}
          onCancelRenameContrast={onCancelRenameContrast}
          onCancelRenameDocument={onCancelRenameDocument}
          handleContrastContextMenu={handleContrastContextMenu}
          handleDocumentContextMenu={handleDocumentContextMenu}
        />
      </div>

      {contrastContextMenu ? (
        <TranslationSidebarContextMenu
          x={contrastContextMenu.x}
          y={contrastContextMenu.y}
          onClose={() => setContrastContextMenu(null)}
          onRename={() => onStartRenameContrast(contrastContextMenu.contrast.id)}
          onAddToKnowledge={() => onAddContrastToKnowledge(contrastContextMenu.contrast)}
          onAddToNotes={() => onAddContrastToNotes(contrastContextMenu.contrast)}
          onDelete={() => setDeleteContrastTarget(contrastContextMenu.contrast)}
        />
      ) : null}

      {documentContextMenu ? (
        <TranslationSidebarContextMenu
          x={documentContextMenu.x}
          y={documentContextMenu.y}
          onClose={() => setDocumentContextMenu(null)}
          onRename={() => onStartRenameDocument(documentContextMenu.document.id)}
          onAddToKnowledge={() => onAddDocumentToKnowledge(documentContextMenu.document)}
          onAddToNotes={() => onAddDocumentToNotes(documentContextMenu.document)}
          onDelete={() => setDeleteDocumentTarget(documentContextMenu.document)}
        />
      ) : null}

      {deleteContrastTarget ? (
        <ConfirmDialog
          title={t('translationPage.sidebar.deleteContrastTitle')}
          message={t('translationPage.sidebar.deleteContrastMessage', {
            title: deleteContrastTarget.title,
          })}
          confirmLabel={t('common.delete')}
          cancelLabel={t('common.cancel')}
          danger
          onCancel={() => setDeleteContrastTarget(null)}
          onConfirm={() => {
            onDeleteContrast(deleteContrastTarget.id)
            setDeleteContrastTarget(null)
          }}
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
    </aside>
  )
}
