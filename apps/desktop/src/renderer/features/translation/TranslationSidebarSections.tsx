import type { MouseEvent } from 'react'
import { IconChevronRight, IconPlus } from '../../components/icons'
import { TranslationSidebarContrastItem } from './TranslationSidebarContrastItem'
import { TranslationSidebarDocumentItem } from './TranslationSidebarDocumentItem'
import type { TranslationContrastItem, TranslationDocumentItem } from './translation-storage'
import {
  TRANSLATION_SIDEBAR_SECTIONS,
  type TranslationSidebarSection,
} from './translation-sidebar-types'

type Props = {
  t: (key: string) => string
  configEmptyHint: string
  activeSection: TranslationSidebarSection
  expanded: Set<TranslationSidebarSection>
  contrasts: TranslationContrastItem[]
  documents: TranslationDocumentItem[]
  activeContrastId: string | null
  activeDocumentId: string | null
  renameContrastId: string | null
  renameDocumentId: string | null
  toggleExpanded: (section: TranslationSidebarSection) => void
  handleSectionClick: (section: TranslationSidebarSection) => void
  handleCreateContrast: () => void
  handleOpenDocument: () => void
  onSelectContrast: (contrastId: string) => void
  onSelectDocument: (documentId: string) => void
  onRenameContrast: (contrastId: string, title: string) => void
  onRenameDocument: (documentId: string, title: string) => void
  onStartRenameContrast: (contrastId: string) => void
  onStartRenameDocument: (documentId: string) => void
  onCancelRenameContrast: () => void
  onCancelRenameDocument: () => void
  handleContrastContextMenu: (event: MouseEvent, contrast: TranslationContrastItem) => void
  handleDocumentContextMenu: (event: MouseEvent, document: TranslationDocumentItem) => void
}

export function TranslationSidebarSections(props: Props) {
  const {
    t,
    configEmptyHint,
    activeSection,
    expanded,
    contrasts,
    documents,
    activeContrastId,
    activeDocumentId,
    renameContrastId,
    renameDocumentId,
    toggleExpanded,
    handleSectionClick,
    handleCreateContrast,
    handleOpenDocument,
    onSelectContrast,
    onSelectDocument,
    onRenameContrast,
    onRenameDocument,
    onStartRenameContrast,
    onStartRenameDocument,
    onCancelRenameContrast,
    onCancelRenameDocument,
    handleContrastContextMenu,
    handleDocumentContextMenu,
  } = props

  return (
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
            <div className="tm-empty">{configEmptyHint}</div>
          ) : null}
        </div>
  )
}
