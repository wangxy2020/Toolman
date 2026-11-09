import { useEffect, useState } from 'react'
import type { MouseEvent } from 'react'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { IconPlus } from '../../components/icons'
import { getModulePageConfig } from '../modules/module-config'
import { useI18n } from '../../i18n/useI18n'
import { TranslationSidebarContextMenu } from './TranslationSidebarContextMenu'
import { TranslationSidebarSections } from './TranslationSidebarSections'
import type { TranslationDocumentItem } from './translation-storage'
import {
  DEFAULT_TRANSLATION_SECTION,
  type TranslationSidebarSection,
} from './translation-sidebar-types'

interface Props {
  activeSection: TranslationSidebarSection
  onSelectSection: (section: TranslationSidebarSection) => void
  onOpenDocument: () => void
  documents: TranslationDocumentItem[]
  activeDocumentId: string | null
  renameDocumentId: string | null
  onSelectDocument: (documentId: string) => void
  onStartRenameDocument: (documentId: string) => void
  onRenameDocument: (documentId: string, title: string) => void
  onCancelRenameDocument: () => void
  onDeleteDocument: (documentId: string) => void
  onAddDocumentToKnowledge: (document: TranslationDocumentItem) => void
  onAddDocumentToNotes: (document: TranslationDocumentItem) => void
}

export function TranslationSidebar({
  activeSection,
  onSelectSection,
  onOpenDocument,
  documents,
  activeDocumentId,
  renameDocumentId,
  onSelectDocument,
  onStartRenameDocument,
  onRenameDocument,
  onCancelRenameDocument,
  onDeleteDocument,
  onAddDocumentToKnowledge,
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

  const [documentContextMenu, setDocumentContextMenu] = useState<{
    x: number
    y: number
    document: TranslationDocumentItem
  } | null>(null)
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

  const handleOpenDocument = () => {
    handleSectionClick('documents')
    onOpenDocument()
  }

  const handleDocumentContextMenu = (
    event: MouseEvent,
    document: TranslationDocumentItem,
  ) => {
    event.preventDefault()
    event.stopPropagation()
    setDocumentContextMenu({
      x: event.clientX,
      y: event.clientY,
      document,
    })
  }

  return (
    <aside className="tm-sidebar">
      <div className="tm-sidebar-content">
        <button type="button" className="tm-sidebar-add" onClick={handleOpenDocument}>
          <IconPlus />
          {t('translationPage.sidebar.newDocument')}
        </button>

        <TranslationSidebarSections
          t={t}
          configEmptyHint={config.sidebarEmptyHint}
          activeSection={activeSection}
          expanded={expanded}
          documents={documents}
          activeDocumentId={activeDocumentId}
          renameDocumentId={renameDocumentId}
          toggleExpanded={toggleExpanded}
          handleSectionClick={handleSectionClick}
          handleOpenDocument={handleOpenDocument}
          onSelectDocument={onSelectDocument}
          onRenameDocument={onRenameDocument}
          onStartRenameDocument={onStartRenameDocument}
          onCancelRenameDocument={onCancelRenameDocument}
          handleDocumentContextMenu={handleDocumentContextMenu}
        />
      </div>

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
