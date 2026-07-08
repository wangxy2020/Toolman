import { useEffect, useState } from 'react'
import type { MouseEvent } from 'react'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { IconChevronRight, IconPlus } from '../../components/icons'
import { getModulePageConfig } from '../modules/module-config'
import { useI18n } from '../../i18n/useI18n'
import { TranslationSidebarContextMenu } from './TranslationSidebarContextMenu'
import { TranslationSidebarContrastItem } from './TranslationSidebarContrastItem'
import { TranslationSidebarDocumentItem } from './TranslationSidebarDocumentItem'
import type { TranslationContrastItem, TranslationDocumentItem } from './translation-storage'
import {
  DEFAULT_TRANSLATION_SECTION,
  TRANSLATION_SIDEBAR_SECTIONS,
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

        <div className="tm-sidebar-list">
          {TRANSLATION_SIDEBAR_SECTIONS.map((section) => {
            const isOpen = expanded.has(section.id)
            // Only highlight the section header when this section is current and no child item is selected.
            const hasActiveChild =
              section.id === 'contrast' ? Boolean(activeContrastId) : Boolean(activeDocumentId)
            const isSectionActive = activeSection === section.id && !hasActiveChild
            const sectionLabel = t(`translationPage.sections.${section.id}`)

            return (
              <div key={section.id} className="tm-assistant-group">
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
                    onClick={() => toggleExpanded(section.id)}
                  >
                    <IconChevronRight open={isOpen} />
                  </button>
                  <button
                    type="button"
                    className={[
                      'tm-assistant-name',
                      isSectionActive ? 'tm-assistant-name--active' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => handleSectionClick(section.id)}
                  >
                    {sectionLabel}
                  </button>
                  <div className="tm-assistant-actions">
                    <button
                      type="button"
                      className="tm-assistant-action-btn"
                      aria-label={
                        section.id === 'documents'
                          ? t('translationPage.sidebar.newDocument')
                          : t('translationPage.sidebar.newContrast')
                      }
                      onClick={
                        section.id === 'documents' ? handleOpenDocument : handleCreateContrast
                      }
                    >
                      <IconPlus size={14} />
                    </button>
                  </div>
                </div>

                {isOpen ? (
                  <div className="tm-assistant-sessions">
                    {section.id === 'contrast' ? (
                      contrasts.length > 0 ? (
                        contrasts.map((contrast) => (
                          <TranslationSidebarContrastItem
                            key={contrast.id}
                            contrast={contrast}
                            isActive={
                              activeSection === 'contrast' && activeContrastId === contrast.id
                            }
                            isRenaming={renameContrastId === contrast.id}
                            onSelect={onSelectContrast}
                            onRename={onRenameContrast}
                            onStartRename={() => onStartRenameContrast(contrast.id)}
                            onCancelRename={onCancelRenameContrast}
                            onContextMenu={handleContrastContextMenu}
                          />
                        ))
                      ) : (
                        <div className="tm-empty tm-translation-sidebar-empty">
                          {t('translationPage.sidebar.emptyContrasts')}
                        </div>
                      )
                    ) : documents.length > 0 ? (
                      documents.map((document) => (
                        <TranslationSidebarDocumentItem
                          key={document.id}
                          document={document}
                          isActive={
                            activeSection === 'documents' && activeDocumentId === document.id
                          }
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

          {!TRANSLATION_SIDEBAR_SECTIONS.length ? (
            <div className="tm-empty">{config.sidebarEmptyHint}</div>
          ) : null}
        </div>
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
