import type { MouseEvent } from 'react'
import { IconChevronRight, IconPlus } from '../../components/icons'
import { TranslationSidebarDocumentItem } from './TranslationSidebarDocumentItem'
import type { TranslationDocumentItem } from './translation-storage'
import {
  TRANSLATION_SIDEBAR_SECTIONS,
  type TranslationSidebarSection,
} from './translation-sidebar-types'

type Props = {
  t: (key: string) => string
  configEmptyHint: string
  activeSection: TranslationSidebarSection
  expanded: Set<TranslationSidebarSection>
  documents: TranslationDocumentItem[]
  activeDocumentId: string | null
  renameDocumentId: string | null
  toggleExpanded: (section: TranslationSidebarSection) => void
  handleSectionClick: (section: TranslationSidebarSection) => void
  handleOpenDocument: () => void
  onSelectDocument: (documentId: string) => void
  onRenameDocument: (documentId: string, title: string) => void
  onStartRenameDocument: (documentId: string) => void
  onCancelRenameDocument: () => void
  handleDocumentContextMenu: (event: MouseEvent, document: TranslationDocumentItem) => void
}

export function TranslationSidebarSections(props: Props) {
  const {
    t,
    configEmptyHint,
    activeSection,
    expanded,
    documents,
    activeDocumentId,
    renameDocumentId,
    toggleExpanded,
    handleSectionClick,
    handleOpenDocument,
    onSelectDocument,
    onRenameDocument,
    onStartRenameDocument,
    onCancelRenameDocument,
    handleDocumentContextMenu,
  } = props

  return (
    <div className="tm-sidebar-list">
      {TRANSLATION_SIDEBAR_SECTIONS.map((section) => {
        const isOpen = expanded.has(section.id)
        const hasActiveChild = Boolean(activeDocumentId)
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
                  aria-label={t('translationPage.sidebar.newDocument')}
                  onClick={handleOpenDocument}
                >
                  <IconPlus size={14} />
                </button>
              </div>
            </div>

            {isOpen ? (
              <div className="tm-assistant-sessions">
                {documents.length > 0 ? (
                  documents.map((document) => (
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

      {!TRANSLATION_SIDEBAR_SECTIONS.length ? (
        <div className="tm-empty">{configEmptyHint}</div>
      ) : null}
    </div>
  )
}
